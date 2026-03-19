const { buildSearchProfile } = require("../llm/perfumeSearchProfile");
const { rerankAndExplain } = require("../llm/rerankExplainer");
const { attachReasons } = require("../llm/resultExplainer");
const { findCandidates } = require("../search/candidateSearch");
const { rerankTopK } = require("../search/candidateRerank");
const { getPerfumeById } = require("../search/catalogRepo");
const { sendPerfumeCard } = require("./sendPerfumeCard");
const { SEARCH } = require("../config");
const { moreSimilarKeyboard } = require("../ui/keyboards");
const {
  setSimilarState,
  getSimilarState,
  clearSimilarState,
} = require("./similarState");

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

function buildAnalysisFromPerfume(base) {
  return {
    found: true,
    query_type: "reference_perfume",
    target_name: base.name || "",
    brand: base.brand || "",
    gender: base.gender || "unknown",
    seasons: base.season
      ? String(base.season)
          .split(/[;,/|]+/)
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    style: base.accords
      ? String(base.accords)
          .split(/[;,/|]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
    notes_top: [],
    notes_heart: [],
    notes_base: [],
    accords: base.accords
      ? String(base.accords)
          .split(/[;,/|]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [],
    search_terms: [base.name, base.number_code, base.notes, base.accords]
      .filter(Boolean)
      .join(" | "),
    intent_context: {
      best_for: base.occasion
        ? String(base.occasion)
            .split(/[;,/|]+/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      projection: "unknown",
      longevity: "unknown",
      age_group: "unknown",
      image_style: [],
    },
    user_friendly_reply: "",
    search_hint_text: base.description || "",
  };
}

function decorateItem(item) {
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

async function sendBatch(ctx, baseId, items, offset = 0, batchSize = 3) {
  const batch = items.slice(offset, offset + batchSize);
  const sent = [];

  for (const item of batch) {
    try {
      await sendPerfumeCard(ctx, decorateItem(item), {
        notes: false,
        season: false,
      });
      sent.push(item);
    } catch (e) {
      console.error("similar sendBatch item failed:", item?.id, item?.name, e?.message || e);
    }
  }

  const nextOffset = offset + sent.length;
 return nextOffset;
} 

async function onSimilarAction(ctx, perfumeId) {
  const base = getPerfumeById(Number(perfumeId));

  if (!base) {
    await ctx.reply("❌ Не знайшов базовий аромат.");
    return;
  }

 await ctx.reply(`🔁 Шукаю схожі на ${base.name}...`);

  const analysis = buildAnalysisFromPerfume(base);

  let searchProfile;
  try {
    searchProfile = await buildSearchProfile(analysis);
  } catch (e) {
    console.error("buildSearchProfile(similar) error:", e);
    await ctx.reply("❌ Не вдалося побудувати профіль схожості.");
    return;
  }

  let candidates = [];
  try {
    candidates = findCandidates(searchProfile, SEARCH.LIMIT_CANDIDATES || 80);
  } catch (e) {
    console.error("findCandidates(similar) error:", e);
    await ctx.reply("❌ Помилка пошуку схожих у базі.");
    return;
  }

  candidates = candidates.filter((x) => Number(x.id) !== Number(base.id));

  if (!candidates.length) {
    await ctx.reply("😔 Схожих ароматів у базі не знайшов.");
    return;
  }

  let allItems = rerankTopK(candidates, searchProfile, base.name, 50);

  try {
    const gptSelected = await rerankAndExplain({
      userText: `Знайди найбільш схожі аромати на ${base.name}`,
      analysis,
      searchProfile,
      candidates: candidates.slice(0, 10),
      topK: Math.min(10, candidates.length),
    });

    if (Array.isArray(gptSelected) && gptSelected.length) {
      const selectedIds = gptSelected.map((x) => Number(x.id));
      const selectedItems = candidates.filter((x) =>
        selectedIds.includes(Number(x.id)),
      );

      if (selectedItems.length) {
        allItems = selectedIds
          .map((id) => selectedItems.find((x) => Number(x.id) === id))
          .filter(Boolean);

        allItems = mergeGptReasons(allItems, gptSelected);
      }
    }
  } catch (e) {
    console.error("rerankAndExplain(similar) error:", e);
  }

  allItems = attachReasons(allItems, searchProfile);

  if (!allItems.length) {
    await ctx.reply("❌ Не вдалося відібрати схожі аромати.");
    return;
  }

  setSimilarState(ctx.chat.id, base.id, {
    items: allItems,
    offset: 0,
    sentIds: [],
  });

await ctx.reply(`✨ Найбільш схожі на ${base.name}:`);

  const nextOffset = await sendBatch(ctx, base.id, allItems, 0, 3);

  setSimilarState(ctx.chat.id, base.id, {
    items: allItems,
    offset: nextOffset,
    sentIds: allItems.slice(0, nextOffset).map((x) => x.id),
  });

  if (nextOffset >= allItems.length) {
    clearSimilarState(ctx.chat.id, base.id);
  }
}

async function onSimilarMoreAction(ctx, perfumeId) {
  const base = getPerfumeById(Number(perfumeId));
  const saved = getSimilarState(ctx.chat.id, Number(perfumeId));

  if (!saved || !Array.isArray(saved.items) || !saved.items.length) {
    await ctx.reply("ℹ️ Більше схожих варіантів немає. Натисніть `Схожі` ще раз.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const remaining = saved.items.filter((x) => !saved.sentIds.includes(x.id));

  if (!remaining.length) {
    clearSimilarState(ctx.chat.id, Number(perfumeId));
    await ctx.reply("✅ Це були всі схожі варіанти.");
    return;
  }

  if (base) {
    await ctx.reply(`🔎 Показую ще схожі на **${base.name}**:`, {
      parse_mode: "Markdown",
    });
  }

  const nextOffset = await sendBatch(
    ctx,
    Number(perfumeId),
    saved.items,
    saved.offset,
    3,
  );

  const nextSent = saved.items.slice(0, nextOffset).map((x) => x.id);

  setSimilarState(ctx.chat.id, Number(perfumeId), {
    items: saved.items,
    offset: nextOffset,
    sentIds: nextSent,
  });

  if (nextOffset >= saved.items.length) {
    clearSimilarState(ctx.chat.id, Number(perfumeId));
    await ctx.reply("✅ Це були всі схожі варіанти.");
  }
}

module.exports = {
  onSimilarAction,
  onSimilarMoreAction,
};