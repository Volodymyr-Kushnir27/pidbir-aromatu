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
  findByExactName,
  findByNumberCode,
  findAllByNumericCode,
  looksLikePerfumeCode,
  normalizeCode,
  extractNumericCode,
} = require("../search/catalogRepo");

const { sendPerfumeCard } = require("./sendPerfumeCard");

const modeState = new Map();
// tgId -> {
//   mode: "pick",
//   lastSearch: {
//     originalText,
//     analysis,
//     searchProfile,
//     requestedGender,
//     primaryItems,
//     fallbackItems,
//     allItems,
//     offset,
//     sentIds
//   }
// }

function getTgId(ctx) {
  return ctx.from?.id;
}

function setMode(ctx, mode) {
  const tgId = getTgId(ctx);
  if (!tgId) return;

  const prev = modeState.get(tgId) || {};
  modeState.set(tgId, {
    ...prev,
    mode,
  });
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

function setLastSearch(ctx, payload) {
  const tgId = getTgId(ctx);
  if (!tgId) return;

  const prev = modeState.get(tgId) || {};
  modeState.set(tgId, {
    ...prev,
    mode: prev.mode || "pick",
    lastSearch: payload,
  });
}

function getLastSearch(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return null;
  return modeState.get(tgId)?.lastSearch || null;
}

function clearLastSearch(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return;

  const prev = modeState.get(tgId) || {};
  modeState.set(tgId, {
    ...prev,
    lastSearch: null,
  });
}

async function onUserPickAction(ctx) {
  setMode(ctx, "pick");
  clearLastSearch(ctx);
  return ctx.reply(PICK_MODE_HELP);
}

/* =========================
   Helpers
========================= */
function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
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

  const commentBlock = assistantComment ? `\n\n🗣 ${assistantComment}` : "";
  const metaBlock = renderMetaComment(item);

  return {
    ...item,
    short_desc: `${item.short_desc || ""}${reasonBlock}${commentBlock}${metaBlock}`.trim(),
  };
}

function detectRequestedGender(text, analysis, searchProfile) {
  const t = norm(text);

  if (
    /\b(жіночі|жіночий|жіноче|для жінки|для дівчини|дівочі|женские|женский|для женщины|for women|female)\b/i.test(
      t,
    )
  ) {
    return "female";
  }

  if (
    /\b(чоловічі|чоловічий|чоловіче|для чоловіка|для хлопця|мужские|мужской|для мужчины|for men|male)\b/i.test(
      t,
    )
  ) {
    return "male";
  }

  if (/\b(унісекс|унісексові|unisex)\b/i.test(t)) {
    return "unisex";
  }

  const candidates = [
    analysis?.gender,
    analysis?.for_gender,
    analysis?.target_gender,
    analysis?.intent_context?.gender,
    searchProfile?.gender,
    searchProfile?.for_gender,
  ]
    .filter(Boolean)
    .map((x) => norm(x));

  for (const g of candidates) {
    if (
      [
        "female",
        "women",
        "woman",
        "жіночий",
        "жіночі",
        "женский",
        "женские",
      ].includes(g)
    ) {
      return "female";
    }

    if (
      [
        "male",
        "men",
        "man",
        "чоловічий",
        "чоловічі",
        "мужской",
        "мужские",
      ].includes(g)
    ) {
      return "male";
    }

    if (["unisex", "унісекс"].includes(g)) {
      return "unisex";
    }
  }

  return null;
}

function getItemGenderKind(item) {
  const g = norm(item?.gender);

  if (!g) return "unknown";

  const isFemale =
    g.includes("жі") ||
    g.includes("жен") ||
    g.includes("female") ||
    g.includes("women") ||
    g.includes("woman");

  const isMale =
    g.includes("чол") ||
    g.includes("муж") ||
    g.includes("male") ||
    g.includes("men") ||
    g.includes("man");

  const isUnisex = g.includes("уніс") || g.includes("unisex");

  if (isFemale) return "female";
  if (isMale) return "male";
  if (isUnisex) return "unisex";

  return "unknown";
}

function splitByRequestedGender(items, requestedGender) {
  const primary = [];
  const fallback = [];
  const other = [];

  for (const item of items || []) {
    const kind = getItemGenderKind(item);

    if (requestedGender === "female") {
      if (kind === "female") primary.push(item);
      else if (kind === "unisex") fallback.push(item);
      else other.push(item);
      continue;
    }

    if (requestedGender === "male") {
      if (kind === "male") primary.push(item);
      else if (kind === "unisex") fallback.push(item);
      else other.push(item);
      continue;
    }

    if (requestedGender === "unisex") {
      if (kind === "unisex") primary.push(item);
      else other.push(item);
      continue;
    }

    primary.push(item);
  }

  return {
    primary: uniqById(primary),
    fallback: uniqById(fallback),
    other: uniqById(other),
  };
}

function applyHardFilters(items, text, analysis, searchProfile) {
  const requestedGender = detectRequestedGender(text, analysis, searchProfile);
  let filtered = [...(items || [])];

  if (!requestedGender) {
    return {
      requestedGender: null,
      filtered: uniqById(filtered),
      primaryItems: uniqById(filtered),
      fallbackItems: [],
      allItems: uniqById(filtered),
    };
  }

  if (requestedGender === "female") {
    filtered = filtered.filter((item) => {
      const kind = getItemGenderKind(item);
      return kind === "female" || kind === "unisex";
    });
  } else if (requestedGender === "male") {
    filtered = filtered.filter((item) => {
      const kind = getItemGenderKind(item);
      return kind === "male" || kind === "unisex";
    });
  } else if (requestedGender === "unisex") {
    filtered = filtered.filter((item) => getItemGenderKind(item) === "unisex");
  }

  const { primary, fallback } = splitByRequestedGender(filtered, requestedGender);

  return {
    requestedGender,
    filtered: uniqById(filtered),
    primaryItems: primary,
    fallbackItems: fallback,
    allItems: uniqById([...primary, ...fallback]),
  };
}

function rebuildOrderedByGender(items, requestedGender) {
  if (!requestedGender) {
    return {
      primaryItems: uniqById(items || []),
      fallbackItems: [],
      allItems: uniqById(items || []),
    };
  }

  const { primary, fallback } = splitByRequestedGender(items, requestedGender);

  return {
    primaryItems: primary,
    fallbackItems: fallback,
    allItems: uniqById([...primary, ...fallback]),
  };
}

function isFollowupForMore(text) {
  const t = norm(text);

  if (!t) return false;

  if (
    t === "ще" ||
    t === "далі" ||
    t === "інші" ||
    t === "ще варіанти" ||
    t === "інші варіанти" ||
    t === "які ще є" ||
    t === "що ще є" ||
    t === "покажи ще" ||
    t === "ще аромати" ||
    t === "ще парфуми"
  ) {
    return true;
  }

  if (
    /\b(ще|далі)\b/.test(t) &&
    /\b(аромат|аромати|варіант|варіанти|парфум|парфуми)\b/.test(t)
  ) {
    return true;
  }

  if (/\b(дай|покажи|підбери|знайди)\b/.test(t) && /\b(ще|далі)\b/.test(t)) {
    return true;
  }

  if (/\bще\b/.test(t) && /\b\d{1,2}\b/.test(t)) {
    return true;
  }

  return false;
}

function parseBatchSize(text, fallback = 3) {
  const t = String(text || "").toLowerCase();
  const m = t.match(/\b(\d{1,2})\b/);
  if (!m) return fallback;

  const n = Number(m[1]);
  if (!n || n < 1) return fallback;

  return Math.min(n, 10);
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

async function sendItemsBatch(ctx, items) {
  for (const item of items) {
    const payload = buildPayloadWithExplanations(item);

    await sendPerfumeCard(ctx, payload, {
      notes: false,
      season: false,
    });
  }
}

async function sendNextBatchFromState(ctx, saved, text = "") {
  if (!saved) {
    await ctx.reply("ℹ️ Немає збереженого попереднього пошуку. Напишіть новий запит.");
    return true;
  }

  const batchSize = parseBatchSize(text, 3);
  const sentIds = Array.isArray(saved.sentIds) ? saved.sentIds : [];
  const primaryItems = Array.isArray(saved.primaryItems) ? saved.primaryItems : [];
  const fallbackItems = Array.isArray(saved.fallbackItems) ? saved.fallbackItems : [];
  const orderedItems = uniqById([...primaryItems, ...fallbackItems]);

  if (!orderedItems.length) {
    await ctx.reply("ℹ️ Немає збережених результатів. Напишіть новий запит.");
    clearLastSearch(ctx);
    return true;
  }

  const remainingPrimary = primaryItems.filter((x) => !sentIds.includes(x.id));
  const remainingFallback = fallbackItems.filter((x) => !sentIds.includes(x.id));

  let sourceLabel = "ще варіанти";
  let remaining = remainingPrimary;

  if (!remainingPrimary.length && remainingFallback.length) {
    remaining = remainingFallback;

    if (saved.requestedGender === "female") {
      sourceLabel = "ще варіанти, серед яких уже йдуть унісекс";
    } else if (saved.requestedGender === "male") {
      sourceLabel = "ще варіанти, серед яких уже йдуть унісекс";
    } else {
      sourceLabel = "ще варіанти";
    }
  }

  if (!remaining.length) {
    await ctx.reply("✅ Це були всі варіанти за попереднім запитом.");
    clearLastSearch(ctx);
    return true;
  }

  const batch = remaining.slice(0, batchSize);

  await ctx.reply(
    `🔎 Показую ${Math.min(batchSize, remaining.length)} ${sourceLabel}:`,
  );

  await sendItemsBatch(ctx, batch);

  const nextSentIds = [...sentIds, ...batch.map((x) => x.id)];
  const nextOffset = nextSentIds.length;

  setLastSearch(ctx, {
    ...saved,
    sentIds: nextSentIds,
    offset: nextOffset,
  });

  const left = orderedItems.length - nextSentIds.length;

  if (left > 0) {
    await ctx.reply(`➡️ Ще залишилось ${left} варіантів. Напишіть: "ще"`);
  } else {
    await ctx.reply("✅ Це були всі варіанти за цим запитом.");
  }

  return true;
}

/* =========================
   Main
========================= */
async function onUserText(ctx) {
  const mode = getMode(ctx);
  if (mode !== "pick") return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  if (isFollowupForMore(text)) {
    const saved = getLastSearch(ctx);
    return sendNextBatchFromState(ctx, saved, text);
  }

  /* =========================
     0. EXACT NAME MATCH
  ========================= */
  const exactByName = findByExactName(text);

  if (exactByName) {
    clearLastSearch(ctx);

    await ctx.reply(`✅ Знайшов точний збіг за назвою **${exactByName.name}**:`, {
      parse_mode: "Markdown",
    });

    await sendPerfumeCard(ctx, exactByName, {
      notes: true,
      season: true,
    });

    return true;
  }

  await ctx.reply("🔎 Аналізую аромат...");

  /* =========================
     1. SEARCH BY CODE
  ========================= */
  if (looksLikePerfumeCode(text)) {
    const code = normalizeCode(text);
    const byExactCode = findByNumberCode(code);

    if (byExactCode) {
      clearLastSearch(ctx);

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
        clearLastSearch(ctx);

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
    candidates = findCandidates(searchProfile, SEARCH.LIMIT_CANDIDATES || 120);
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
     6. HARD FILTERS + PRIMARY/FALLBACK
  ========================= */
  const filteredPack = applyHardFilters(candidates, text, analysis, searchProfile);

  const requestedGender = filteredPack.requestedGender;
  candidates = filteredPack.filtered;

  if (!candidates.length) {
    if (requestedGender === "female") {
      await ctx.reply(
        "❌ За запитом знайшлися результати, але не залишилось **жіночих** ароматів. Уточніть ноти або стиль.",
        { parse_mode: "Markdown" },
      );
      return true;
    }

    if (requestedGender === "male") {
      await ctx.reply(
        "❌ За запитом знайшлися результати, але не залишилось **чоловічих** ароматів. Уточніть ноти або стиль.",
        { parse_mode: "Markdown" },
      );
      return true;
    }

    if (requestedGender === "unisex") {
      await ctx.reply(
        "❌ За запитом не знайшов відповідних **унісекс** ароматів. Уточніть ноти або стиль.",
        { parse_mode: "Markdown" },
      );
      return true;
    }

    await ctx.reply("❌ Після фільтрації відповідних ароматів не залишилось.");
    return true;
  }

  /* =========================
     7. RERANK
  ========================= */
  let allItems = rerankTopK(
    candidates,
    searchProfile,
    analysis.target_name,
    50,
  );

  let primaryItems = filteredPack.primaryItems;
  let fallbackItems = filteredPack.fallbackItems;

  if (requestedGender) {
    const regroupedBeforeGpt = rebuildOrderedByGender(allItems, requestedGender);
    primaryItems = regroupedBeforeGpt.primaryItems;
    fallbackItems = regroupedBeforeGpt.fallbackItems;
    allItems = regroupedBeforeGpt.allItems;
  } else {
    allItems = uniqById(allItems);
    primaryItems = allItems;
    fallbackItems = [];
  }

  /* =========================
     8. GPT RERANK + EXPLAIN
  ========================= */
  try {
    const gptSelected = await rerankAndExplain({
      userText: text,
      analysis,
      searchProfile,
      candidates: candidates.slice(0, 10),
      topK: Math.min(10, candidates.length),
    });

    if (Array.isArray(gptSelected) && gptSelected.length) {
      allItems = mergeGptReasons(allItems, gptSelected);
      allItems = reorderWithGptPriority(allItems, gptSelected);

      if (requestedGender) {
        const regroupedAfterGpt = rebuildOrderedByGender(allItems, requestedGender);
        primaryItems = regroupedAfterGpt.primaryItems;
        fallbackItems = regroupedAfterGpt.fallbackItems;
        allItems = regroupedAfterGpt.allItems;
      } else {
        allItems = uniqById(allItems);
        primaryItems = allItems;
        fallbackItems = [];
      }
    }
  } catch (e) {
    console.error("rerankAndExplain error:", e);
  }

  /* =========================
     9. LOCAL REASONS
  ========================= */
  allItems = attachReasons(allItems, searchProfile);
  allItems = uniqById(allItems);

  if (requestedGender) {
    const regroupedAfterReasons = rebuildOrderedByGender(allItems, requestedGender);
    primaryItems = regroupedAfterReasons.primaryItems;
    fallbackItems = regroupedAfterReasons.fallbackItems;
    allItems = regroupedAfterReasons.allItems;
  } else {
    primaryItems = allItems;
    fallbackItems = [];
  }

  if (!allItems.length) {
    await ctx.reply("❌ Схожих варіантів не знайшов.");
    return true;
  }

  /* =========================
     10. SAVE SEARCH STATE
  ========================= */
  setLastSearch(ctx, {
    originalText: text,
    analysis,
    searchProfile,
    requestedGender,
    primaryItems,
    fallbackItems,
    allItems,
    offset: 0,
    sentIds: [],
  });

  /* =========================
     11. SEND FIRST BATCH
  ========================= */
  const firstPool = primaryItems.length ? primaryItems : allItems;
  const firstBatch = firstPool.slice(0, 3);

  if (!firstBatch.length) {
    await ctx.reply("❌ Не вдалося сформувати першу видачу.");
    return true;
  }

  await ctx.reply(`✨ Підібрав ${Math.min(3, firstBatch.length)} найбільш схожі варіанти:`);

  await sendItemsBatch(ctx, firstBatch);

  const sentIds = firstBatch.map((x) => x.id);
  const offset = sentIds.length;

  setLastSearch(ctx, {
    originalText: text,
    analysis,
    searchProfile,
    requestedGender,
    primaryItems,
    fallbackItems,
    allItems,
    offset,
    sentIds,
  });

  const left = allItems.length - offset;
  if (left > 0) {
    await ctx.reply(`➡️ Є ще ${left} варіантів. Напишіть: "ще" або "дай ще 3"`);
  }

  return true;
}

module.exports = {
  onUserPickAction,
  onUserText,
  disableMode,
};