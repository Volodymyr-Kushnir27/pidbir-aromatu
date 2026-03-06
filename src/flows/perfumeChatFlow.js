const { SEARCH } = require("../config");
const { PICK_MODE_HELP } = require("../ui/messages");

const { analyzePerfumeIntent } = require("../llm/perfumeAnalyzer");
const { writeReferencePerfumeIntro } = require("../llm/writeReferencePerfumeIntro");
const { buildSearchProfile } = require("../llm/perfumeSearchProfile");
const { attachReasons } = require("../llm/resultExplainer");
const { rerankAndExplain } = require("../llm/rerankExplainer");

const { findCandidates } = require("../search/candidateSearch");
const { rerankTopK } = require("../search/candidateRerank");
const {
  findByNumberCode,
  findAllByNumericCode,
  looksLikePerfumeCode,
  normalizeCode,
  extractNumericCode,
} = require("../search/catalogRepo");

const { sendPerfumeCard } = require("./sendPerfumeCard");

const modeState = new Map();
// tgId -> { mode: "pick" }

function getTgId(ctx) {
  return ctx.from?.id;
}

function setMode(ctx, mode) {
  const tgId = getTgId(ctx);
  if (!tgId) return;
  modeState.set(tgId, { mode });
}

function getMode(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return null;
  return modeState.get(tgId)?.mode || null;
}

function disableMode(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return;
  modeState.delete(tgId);
}

async function onUserPickAction(ctx) {
  setMode(ctx, "pick");
  return ctx.reply(PICK_MODE_HELP);
}

function mergeGptReasons(items, gptSelected = []) {
  const byId = new Map(gptSelected.map((x) => [Number(x.id), x]));

  return items.map((item) => {
    const hit = byId.get(Number(item.id));
    if (!hit) return item;

    return {
      ...item,
      why_selected: Array.isArray(hit.why) ? hit.why : [],
      assistant_comment: String(hit.assistant_comment || "").trim(),
      match_type: hit.match_type || "",
      confidence:
        typeof hit.confidence === "number" ? hit.confidence : null,
      best_for_gpt: Array.isArray(hit.best_for) ? hit.best_for : [],
      projection_fit: hit.projection_fit || "unknown",
      longevity_fit: hit.longevity_fit || "unknown",
    };
  });
}

function renderMetaComment(item) {
  const parts = [];

  if (item.match_type) {
    const map = {
      close_match: "дуже близький загальний збіг",
      style_match: "сильний збіг по стилю",
      note_match: "сильний збіг по нотах",
      occasion_match: "добре підходить під сценарій використання",
    };
    parts.push(`🎯 Збіг: ${map[item.match_type] || item.match_type}`);
  }

  if (item.projection_fit && item.projection_fit !== "unknown") {
    const map = {
      low: "легкий",
      medium: "помірний",
      strong: "виразний шлейф",
    };
    parts.push(`🌬 Шлейф: ${map[item.projection_fit] || item.projection_fit}`);
  }

  if (item.longevity_fit && item.longevity_fit !== "unknown") {
    const map = {
      low: "легка стійкість",
      medium: "середня стійкість",
      long: "хороша стійкість",
    };
    parts.push(`⏳ Стійкість: ${map[item.longevity_fit] || item.longevity_fit}`);
  }

  if (Array.isArray(item.best_for_gpt) && item.best_for_gpt.length) {
    parts.push(`📍 Найкраще для: ${item.best_for_gpt.join(", ")}`);
  }

  if (typeof item.confidence === "number") {
    parts.push(`📊 Впевненість: ${Math.round(item.confidence * 100)}%`);
  }

  return parts.length ? `\n\n${parts.join("\n")}` : "";
}

function hasSearchData(analysis) {
  return (
    analysis?.query_type === "reference_perfume" ||
    analysis?.query_type === "note_search" ||
    analysis?.query_type === "style_search" ||
    analysis?.query_type === "code_search" ||
    (analysis?.search_terms && analysis.search_terms.length) ||
    (analysis?.notes_top && analysis.notes_top.length) ||
    (analysis?.notes_heart && analysis.notes_heart.length) ||
    (analysis?.notes_base && analysis.notes_base.length) ||
    (analysis?.style && analysis.style.length) ||
    (analysis?.accords && analysis.accords.length) ||
    (analysis?.intent_context?.best_for?.length) ||
    analysis?.intent_context?.projection !== "unknown" ||
    analysis?.intent_context?.longevity !== "unknown" ||
    analysis?.intent_context?.age_group !== "unknown" ||
    (analysis?.intent_context?.image_style?.length)
  );
}

function buildPayloadWithExplanations(item) {
  const why = Array.isArray(item.why_selected) ? item.why_selected : [];
  const assistantComment = String(item.assistant_comment || "").trim();

  const reasonBlock = why.length
    ? `\n\n💡 Чому обрано:\n• ${why.join("\n• ")}`
    : `\n\n💡 Чому обрано:\n• близький за загальним характером`;

  const commentBlock = assistantComment
    ? `\n\n🗣 ${assistantComment}`
    : "";

  const metaBlock = renderMetaComment(item);

  return {
    ...item,
    short_desc: `${item.short_desc || ""}${reasonBlock}${commentBlock}${metaBlock}`.trim(),
  };
}

async function onUserText(ctx) {
  const mode = getMode(ctx);
  if (mode !== "pick") return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  await ctx.reply("🔎 Аналізую аромат...");

  /* =========================
     1. SEARCH BY CODE
  ========================= */
  if (looksLikePerfumeCode(text)) {
    const code = normalizeCode(text);
    const byExactCode = findByNumberCode(code);

    if (byExactCode) {
      await ctx.reply(`✅ Знайшов аромат за кодом **${code}**:`, {
        parse_mode: "Markdown",
      });

      await sendPerfumeCard(ctx, byExactCode, {
        notes: true,
        season: true,
      });

      return true;
    }

    const num = extractNumericCode(code);
    if (num) {
      const byNumeric = findAllByNumericCode(num);

      if (byNumeric.length === 1) {
        await ctx.reply(
          `✅ Знайшов аромат за номером **${num}**. У базі він записаний як **${byNumeric[0].number_code}**:`,
          { parse_mode: "Markdown" },
        );

        await sendPerfumeCard(ctx, byNumeric[0], {
          notes: true,
          season: true,
        });

        return true;
      }

      if (byNumeric.length > 1) {
        const top = byNumeric.slice(0, 5);
        const listText =
          `🔎 За номером **${num}** знайшов кілька варіантів:\n\n` +
          top
            .map((item, i) => `${i + 1}. **${item.number_code || "—"}** — ${item.name}`)
            .join("\n") +
          `\n\n✍️ Напишіть точний код з буквою, наприклад: **${top[0]?.number_code || `${num}A`}**`;

        await ctx.reply(listText, { parse_mode: "Markdown" });
        return true;
      }
    }

    await ctx.reply(
      `❌ Не знайшов аромат з кодом **${code}**.\n\nСпробуйте:\n• інший код\n• назву аромату\n• ноти\n• або стиль`,
      { parse_mode: "Markdown" },
    );

    return true;
  }

  /* =========================
     2. ANALYZE USER INTENT
  ========================= */
  let analysis;
  try {
    analysis = await analyzePerfumeIntent(text);
  } catch (e) {
    console.error("analyzePerfumeIntent error:", e);
    await ctx.reply("❌ Не вдалося проаналізувати запит.");
    return true;
  }

  if (!hasSearchData(analysis)) {
    await ctx.reply(
      analysis?.user_friendly_reply ||
        "🤔 Не до кінця зрозумів запит.\n\nНапишіть:\n• назву аромату\n• код\n• ноти\n• стиль\n• або ситуацію використання",
    );
    return true;
  }

  /* =========================
     3. BEAUTIFUL INTRO FOR REFERENCE PERFUME
  ========================= */
  if (analysis.query_type === "reference_perfume") {
    try {
      const introText = await writeReferencePerfumeIntro({
        userText: text,
        analysis,
      });

      if (introText) {
        await ctx.reply(introText);
      } else if (analysis.user_friendly_reply) {
        await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
      }
    } catch (e) {
      console.error("writeReferencePerfumeIntro error:", e);

      if (analysis.user_friendly_reply) {
        await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
      }
    }
  } else if (analysis.user_friendly_reply) {
    await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
  }

  /* =========================
     4. BUILD SEARCH PROFILE
  ========================= */
  let searchProfile;
  try {
    searchProfile = await buildSearchProfile(analysis);
  } catch (e) {
    console.error("buildSearchProfile error:", e);
    await ctx.reply("❌ Не вдалося побудувати профіль пошуку.");
    return true;
  }

  /* =========================
     5. DB SEARCH
  ========================= */
  let candidates = [];
  try {
    candidates = findCandidates(searchProfile, SEARCH.LIMIT_CANDIDATES || 80);
  } catch (e) {
    console.error("findCandidates error:", e);
    await ctx.reply("❌ Помилка пошуку в базі.");
    return true;
  }

  if (!candidates.length) {
    await ctx.reply(
      "😔 У базі поки не знайшов вдалих збігів.\n\nМожете уточнити:\n• для кого аромат\n• які ноти\n• який стиль\n• на яку ситуацію\n• який шлейф або стійкість",
    );
    return true;
  }

  /* =========================
     6. LOCAL FALLBACK TOP-K
  ========================= */
  let top = rerankTopK(
    candidates,
    searchProfile,
    analysis.target_name,
    SEARCH.TOP_K || 3,
  );

  /* =========================
     7. GPT RERANK + EXPLAIN
  ========================= */
  try {
    const gptSelected = await rerankAndExplain({
      userText: text,
      analysis,
      searchProfile,
      candidates: candidates.slice(0, 10),
      topK: SEARCH.TOP_K || 3,
    });

    if (Array.isArray(gptSelected) && gptSelected.length) {
      const selectedIds = gptSelected.map((x) => Number(x.id));
      const selectedItems = candidates.filter((x) =>
        selectedIds.includes(Number(x.id)),
      );

      if (selectedItems.length) {
        top = selectedIds
          .map((id) => selectedItems.find((x) => Number(x.id) === id))
          .filter(Boolean)
          .slice(0, SEARCH.TOP_K || 3);

        top = mergeGptReasons(top, gptSelected);
      }
    }
  } catch (e) {
    console.error("rerankAndExplain error:", e);
  }

  /* =========================
     8. LOCAL FALLBACK REASONS
  ========================= */
  top = attachReasons(top, searchProfile);

  if (!top.length) {
    await ctx.reply("❌ Схожих варіантів не знайшов.");
    return true;
  }

  await ctx.reply(`✨ Підібрав ${top.length} найбільш схожі варіанти:`);

  for (const item of top) {
    const payload = buildPayloadWithExplanations(item);

    await sendPerfumeCard(ctx, payload, {
      notes: false,
      season: false,
    });
  }

  return true;
}

module.exports = {
  onUserPickAction,
  onUserText,
  disableMode,
};