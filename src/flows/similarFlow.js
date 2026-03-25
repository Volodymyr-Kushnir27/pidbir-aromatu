const { buildSearchProfile } = require("../llm/perfumeSearchProfile");
const { rerankAndExplain } = require("../llm/rerankExplainer");
const { attachReasons } = require("../llm/resultExplainer");
const { findCandidates } = require("../search/candidateSearch");
const { rerankTopK } = require("../search/candidateRerank");
const { getPerfumeById } = require("../search/catalogRepo");
const { sendPerfumeCard } = require("./sendPerfumeCard");
const { SEARCH } = require("../config");
const {
  setSimilarState,
  getSimilarState,
  clearSimilarState,
} = require("./similarState");

const similarInFlight = new Map();
// key = `${chatId}:${baseId}` -> true

function makeKey(chatId, baseId) {
  return `${chatId}:${baseId}`;
}

function uniqById(items) {
  const seen = new Set();
  const out = [];

  for (const item of items || []) {
    const id = Number(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }

  return out;
}

function mergeGptReasons(items, gptSelected = []) {
  const byId = new Map((gptSelected || []).map((x) => [Number(x.id), x]));

  return (items || []).map((item) => {
    const hit = byId.get(Number(item.id));
    if (!hit) return item;

    return {
      ...item,
      why_selected: Array.isArray(hit.why) ? hit.why : [],
      assistant_comment: String(hit.assistant_comment || "").trim(),
      match_type: hit.match_type || "",
      confidence: typeof hit.confidence === "number" ? hit.confidence : null,
      best_for_gpt: Array.isArray(hit.best_for) ? hit.best_for : [],
      projection_fit: hit.projection_fit || "unknown",
      longevity_fit: hit.longevity_fit || "unknown",
    };
  });
}

function reorderWithGptPriority(allItems, gptSelected = []) {
  if (!Array.isArray(allItems) || !allItems.length) return [];
  if (!Array.isArray(gptSelected) || !gptSelected.length) return allItems;

  const selectedIds = gptSelected.map((x) => Number(x.id));
  const selectedSet = new Set(selectedIds);

  const prioritized = selectedIds
    .map((id) => allItems.find((x) => Number(x.id) === id))
    .filter(Boolean);

  const rest = allItems.filter((x) => !selectedSet.has(Number(x.id)));

  return uniqById([...prioritized, ...rest]);
}

function renderMetaComment() {
  return "";
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

  const whyLines = why.length
    ? why
        .slice(0, 2)
        .map((x) => `• ${String(x || "").trim()}`)
        .join("\n")
    : "• близький за характером до базового аромату\n• має схожий напрям і загальне враження";

  return {
    ...item,
    short_desc: `${String(item.short_desc || "").trim()}\n\n💡 Чому обрано:\n${whyLines}`.trim(),
  };
}

async function createProgressMessage(ctx, text) {
  try {
    return await ctx.reply(text);
  } catch {
    return null;
  }
}

async function updateProgressMessage(ctx, progressMsg, text) {
  if (!progressMsg?.message_id || !ctx.chat?.id) return;

  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progressMsg.message_id,
      undefined,
      text,
    );
  } catch {}
}

function formatMs(ms) {
  if (!ms || ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

async function sendBatch(ctx, items, offset = 0, batchSize = 3) {
  const batch = items.slice(offset, offset + batchSize);
  const sent = [];
  const failed = [];

  for (const item of batch) {
    try {
      await sendPerfumeCard(ctx, decorateItem(item), {
        notes: true,
        season: false,
      });
      sent.push(item);
    } catch (e) {
      console.error(
        "similar sendBatch item failed:",
        item?.id,
        item?.name,
        e?.message || e,
      );
      failed.push(item);
    }
  }

  return {
    sent,
    failed,
    nextOffset: offset + sent.length,
  };
}

async function onSimilarAction(ctx, perfumeId) {
  const base = getPerfumeById(Number(perfumeId));

  if (!base) {
    await ctx.reply("❌ Не знайшов базовий аромат.");
    return;
  }

  const key = makeKey(ctx.chat.id, base.id);

  if (similarInFlight.has(key)) {
    try {
      await ctx.answerCbQuery("⏳ Пошук схожих уже виконується...");
    } catch {}
    return;
  }

  similarInFlight.set(key, true);

  const startedAt = Date.now();
  const progressMsg = await createProgressMessage(
    ctx,
    `🔁 Шукаю схожі на ${base.name}...\n\n1/4 Аналізую базовий аромат`
  );

  try {
    try {
      await ctx.answerCbQuery("🔁 Шукаю схожі аромати...");
    } catch {}

    try {
      await ctx.sendChatAction("typing");
    } catch {}

    const analysis = buildAnalysisFromPerfume(base);

    await updateProgressMessage(
      ctx,
      progressMsg,
      `🔁 Шукаю схожі на ${base.name}...\n\n1/4 Базовий аромат розібрано\n2/4 Будую профіль схожості`
    );

    let searchProfile;
    try {
      searchProfile = await buildSearchProfile(analysis);
    } catch (e) {
      console.error("buildSearchProfile(similar) error:", e);
      await updateProgressMessage(
        ctx,
        progressMsg,
        "❌ Не вдалося побудувати профіль схожості."
      );
      await ctx.reply("❌ Не вдалося побудувати профіль схожості.");
      return;
    }

    await updateProgressMessage(
      ctx,
      progressMsg,
      `🔁 Шукаю схожі на ${base.name}...\n\n1/4 Базовий аромат розібрано\n2/4 Профіль готовий\n3/4 Шукаю кандидати в базі`
    );

    let candidates = [];
    try {
      candidates = findCandidates(searchProfile, SEARCH.LIMIT_CANDIDATES || 80);
    } catch (e) {
      console.error("findCandidates(similar) error:", e);
      await updateProgressMessage(
        ctx,
        progressMsg,
        "❌ Помилка пошуку схожих у базі."
      );
      await ctx.reply("❌ Помилка пошуку схожих у базі.");
      return;
    }

    candidates = candidates.filter((x) => Number(x.id) !== Number(base.id));

    if (!candidates.length) {
      await updateProgressMessage(
        ctx,
        progressMsg,
        "😔 Схожих ароматів у базі не знайдено."
      );
      await ctx.reply("😔 Схожих ароматів у базі не знайшов.");
      return;
    }

    await updateProgressMessage(
      ctx,
      progressMsg,
      `🔁 Шукаю схожі на ${base.name}...\n\n1/4 Базовий аромат розібрано\n2/4 Профіль готовий\n3/4 Кандидати знайдені\n4/4 Роблю фінальний відбір`
    );

    let allItems = rerankTopK(candidates, searchProfile, base.name, 25);

    try {
      const gptSelected = await rerankAndExplain({
        userText: `Знайди найбільш схожі аромати на ${base.name}`,
        analysis,
        searchProfile,
        candidates: allItems.slice(0, 6),
        topK: Math.min(6, allItems.length),
      });

      if (Array.isArray(gptSelected) && gptSelected.length) {
        allItems = mergeGptReasons(allItems, gptSelected);
        allItems = reorderWithGptPriority(allItems, gptSelected);
      }
    } catch (e) {
      console.error("rerankAndExplain(similar) error:", e);
    }

    allItems = attachReasons(allItems, searchProfile);
    allItems = uniqById(allItems);

    if (!allItems.length) {
      await updateProgressMessage(
        ctx,
        progressMsg,
        "❌ Не вдалося відібрати схожі аромати."
      );
      await ctx.reply("❌ Не вдалося відібрати схожі аромати.");
      return;
    }

    setSimilarState(ctx.chat.id, base.id, {
      items: allItems,
      offset: 0,
      sentIds: [],
    });

    await updateProgressMessage(
      ctx,
      progressMsg,
      `🔁 Шукаю схожі на ${base.name}...\n\n1/4 Базовий аромат розібрано\n2/4 Профіль готовий\n3/4 Кандидати знайдені\n4/4 Відбір завершено\n📦 Надсилаю результати`
    );

    await ctx.reply(`✨ Найбільш схожі на ${base.name}:`);

    const { sent, failed, nextOffset } = await sendBatch(ctx, allItems, 0, 3);

    if (failed.length) {
      console.error(
        "similar first batch failed:",
        failed.map((x) => ({ id: x.id, name: x.name }))
      );
    }

    setSimilarState(ctx.chat.id, base.id, {
      items: allItems,
      offset: nextOffset,
      sentIds: sent.map((x) => x.id),
    });

    const totalMs = Date.now() - startedAt;

    await updateProgressMessage(
      ctx,
      progressMsg,
      `✅ Схожі аромати знайдено за ${formatMs(totalMs)}`
    );

    const left = allItems.length - sent.length;
    if (left > 0) {
      await ctx.reply(`➡️ Є ще ${left} схожих варіантів. Натисніть "Схожі" ще раз.`);
    } else {
      clearSimilarState(ctx.chat.id, base.id);
    }
  } finally {
    similarInFlight.delete(key);
  }
}

async function onSimilarMoreAction(ctx, perfumeId) {
  const base = getPerfumeById(Number(perfumeId));
  const saved = getSimilarState(ctx.chat.id, Number(perfumeId));

  if (!saved || !Array.isArray(saved.items) || !saved.items.length) {
    await ctx.reply("ℹ️ Більше схожих варіантів немає. Натисніть Схожі ще раз.");
    return;
  }

  const sentIds = Array.isArray(saved.sentIds) ? saved.sentIds : [];
  const remaining = saved.items.filter((x) => !sentIds.includes(x.id));

  if (!remaining.length) {
    clearSimilarState(ctx.chat.id, Number(perfumeId));
    await ctx.reply("✅ Це були всі схожі варіанти.");
    return;
  }

  if (base) {
    await ctx.reply(`🔎 Показую ще схожі на ${base.name}:`);
  }

  const { sent, failed, nextOffset } = await sendBatch(
    ctx,
    saved.items,
    saved.offset,
    3,
  );

  if (failed.length) {
    console.error(
      "similar next batch failed:",
      failed.map((x) => ({ id: x.id, name: x.name }))
    );
  }

  const nextSentIds = [...sentIds, ...sent.map((x) => x.id)];

  setSimilarState(ctx.chat.id, Number(perfumeId), {
    items: saved.items,
    offset: nextOffset,
    sentIds: nextSentIds,
  });

  const left = saved.items.length - nextSentIds.length;

  if (left > 0) {
    await ctx.reply(`➡️ Ще залишилось ${left} схожих варіантів.`);
  } else {
    clearSimilarState(ctx.chat.id, Number(perfumeId));
    await ctx.reply("✅ Це були всі схожі варіанти.");
  }
}

module.exports = {
  onSimilarAction,
  onSimilarMoreAction,
};