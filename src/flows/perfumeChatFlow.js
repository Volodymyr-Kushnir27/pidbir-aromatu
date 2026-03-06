const { Markup } = require("telegraf");
const { SEARCH } = require("../config");
const { PICK_MODE_HELP } = require("../ui/messages");
const { analyzePerfumeIntent } = require("../llm/perfumeAnalyzer");
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

  return ctx.reply(
    PICK_MODE_HELP,
    Markup.inlineKeyboard([
      [Markup.button.callback("⬅️ Назад", "BACK_HOME")],
      [Markup.button.callback("❌ Вийти", "EXIT_PICK")],
    ]),
  );
}

async function sendCodeVariants(ctx, items, num) {
  const top = items.slice(0, 5);

  const text =
    `🔎 За номером **${num}** знайшов кілька варіантів:\n\n` +
    top
      .map((item, i) => {
        const code = item.number_code || "—";
        return `${i + 1}. **${code}** — ${item.name}`;
      })
      .join("\n") +
    `\n\n✍️ Напишіть точний код з буквою, наприклад: **${top[0]?.number_code || `${num}A`}**`;

  await ctx.reply(text, { parse_mode: "Markdown" });
}

function mergeGptReasons(items, gptSelected = []) {
  const byId = new Map(gptSelected.map((x) => [Number(x.id), x]));

  return items.map((item) => {
    const hit = byId.get(Number(item.id));
    if (!hit) return item;

    const why = Array.isArray(hit.why) ? hit.why : [];
    const assistantComment = String(hit.assistant_comment || "").trim();

    return {
      ...item,
      why_selected: why,
      assistant_comment: assistantComment,
    };
  });
}

async function onUserText(ctx) {
  const mode = getMode(ctx);
  if (mode !== "pick") return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  await ctx.reply("🔎 Аналізую аромат...");

  /* =========================
     1. DIRECT SEARCH BY CODE
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
        await sendCodeVariants(ctx, byNumeric, num);
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
     2. GPT ANALYSIS
  ========================= */
  let analysis;
  try {
    analysis = await analyzePerfumeIntent(text);
  } catch (e) {
    console.error("analyzePerfumeIntent error:", e);
    await ctx.reply("❌ Не вдалося проаналізувати запит.");
    return true;
  }

  const hasSearchData =
    analysis?.query_type === "reference_perfume" ||
    analysis?.query_type === "note_search" ||
    analysis?.query_type === "style_search" ||
    analysis?.query_type === "code_search" ||
    (analysis?.search_terms && analysis.search_terms.length) ||
    (analysis?.notes_top && analysis.notes_top.length) ||
    (analysis?.notes_heart && analysis.notes_heart.length) ||
    (analysis?.notes_base && analysis.notes_base.length) ||
    (analysis?.style && analysis.style.length) ||
    (analysis?.accords && analysis.accords.length);

  if (!hasSearchData) {
    await ctx.reply(
      analysis?.user_friendly_reply ||
        "🤔 Не до кінця зрозумів запит.\n\nНапишіть:\n• назву аромату\n• код\n• ноти\n• або стиль",
    );
    return true;
  }

  if (analysis.user_friendly_reply) {
    await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
  }

  let searchProfile;
  try {
    searchProfile = await buildSearchProfile(analysis);
  } catch (e) {
    console.error("buildSearchProfile error:", e);
    await ctx.reply("❌ Не вдалося побудувати профіль пошуку.");
    return true;
  }

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
      "😔 У базі поки не знайшов вдалих збігів.\n\nМожете уточнити:\n• для кого аромат\n• які ноти\n• який стиль\n• або код",
    );
    return true;
  }

  // локальний fallback top-3
  let top = rerankTopK(
    candidates,
    searchProfile,
    analysis.target_name,
    SEARCH.TOP_K || 3,
  );

  // GPT rerank/explainer поверх топ-10
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
        top = selectedItems.slice(0, SEARCH.TOP_K || 3);
        top = mergeGptReasons(top, gptSelected);
      }
    }
  } catch (e) {
    console.error("rerankAndExplain error:", e);
  }

  // якщо GPT не дав нормальні пояснення — локальний fallback
  top = attachReasons(top, searchProfile).map((item) => {
    if (item.assistant_comment) return item;
    return item;
  });

  if (!top.length) {
    await ctx.reply("❌ Схожих варіантів не знайшов.");
    return true;
  }

  await ctx.reply(`✨ Підібрав ${top.length} найбільш схожі варіанти:`);

  for (const item of top) {
    const why = Array.isArray(item.why_selected) ? item.why_selected : [];
    const assistantComment = String(item.assistant_comment || "").trim();

    const reasonBlock = why.length
      ? `\n\n💡 Чому обрано:\n• ${why.join("\n• ")}`
      : `\n\n💡 Чому обрано:\n• близький за загальним характером`;

    const commentBlock = assistantComment
      ? `\n\n🗣 ${assistantComment}`
      : "";

    const payload = {
      ...item,
      short_desc: `${item.short_desc || ""}${reasonBlock}${commentBlock}`.trim(),
    };

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