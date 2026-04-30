const { SEARCH, ADMINS_PATH, USERS_PATH } = require("../config");
const { PICK_MODE_HELP } = require("../ui/messages");

const { analyzePerfumeIntent } = require("../llm/perfumeAnalyzer");
const { writeReferencePerfumeIntro } = require("../llm/writeReferencePerfumeIntro");
const { buildSearchProfile } = require("../llm/perfumeSearchProfile");
const { attachReasons } = require("../llm/resultExplainer");
const { rerankAndExplain } = require("../llm/rerankExplainer");

const { findCandidates } = require("../search/candidateSearch");
const {
  rerankTopK,
  normalizeGenderValue,
} = require("../search/candidateRerank");

const {
  findByExactName,
  findByNumberCode,
  findAllByNumericCode,
  looksLikePerfumeCode,
  normalizeCode,
  extractNumericCode,
} = require("../search/catalogRepo");

const { sendPerfumeCard } = require("./sendPerfumeCard");
const adminsStore = require("../storage/adminsStore");
const usersStore = require("../storage/usersStore");

const modeState = new Map();

function getTgId(ctx) {
  return ctx.from?.id;
}

function incrementSearchCounterForActor(ctx) {
  const tgId = Number(getTgId(ctx));
  if (!tgId) return false;

  const incAdmin =
    typeof adminsStore.incrementSearchCountByTgId === "function"
      ? adminsStore.incrementSearchCountByTgId(ADMINS_PATH, tgId, 1)
      : false;

  if (incAdmin) return true;

  const incUser =
    typeof usersStore.incrementSearchCountByTgId === "function"
      ? usersStore.incrementSearchCountByTgId(USERS_PATH, tgId, 1)
      : false;

  return incUser;
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

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
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

function uniqStrings(arr = []) {
  return [
    ...new Set(
      (arr || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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

function renderMetaComment() {
  return "";
}

function hasSearchData(analysis) {
  return (
    analysis?.query_type === "reference_perfume" ||
    analysis?.query_type === "note_search" ||
    analysis?.query_type === "style_search" ||
    analysis?.query_type === "code_search" ||
    safeArray(analysis?.search_terms).length > 0 ||
    safeArray(analysis?.notes_top).length > 0 ||
    safeArray(analysis?.notes_heart).length > 0 ||
    safeArray(analysis?.notes_base).length > 0 ||
    safeArray(analysis?.style).length > 0 ||
    safeArray(analysis?.accords).length > 0 ||
    safeArray(analysis?.intent_context?.best_for).length > 0 ||
    analysis?.intent_context?.projection !== "unknown" ||
    analysis?.intent_context?.longevity !== "unknown" ||
    analysis?.intent_context?.age_group !== "unknown" ||
    safeArray(analysis?.intent_context?.image_style).length > 0
  );
}

function buildPayloadWithExplanations(item) {
  const why = Array.isArray(item.why_selected) ? item.why_selected : [];

  const cleanWhy = why
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 2);

  return {
    ...item,
    assistant_comment: "",
    match_type: "",
    confidence: null,
    best_for_gpt: [],
    projection_fit: "unknown",
    longevity_fit: "unknown",
    short_desc: [
      String(item.short_desc || "").trim(),
      cleanWhy.length ? `💡 Чому обрано:\n• ${cleanWhy.join("\n• ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim(),
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

function isFollowupForMore(text, hasSavedSearch = false) {
  const t = norm(text);
  if (!t) return false;

  if (
    t === "ще" ||
    t === "далі" ||
    t === "ще 3" ||
    t === "ще 5" ||
    t === "дай ще" ||
    t === "дай ще 3" ||
    t === "дай ще 5" ||
    t === "покажи ще" ||
    t === "покажи ще 3" ||
    t === "покажи ще 5" ||
    t === "ще варіанти" ||
    t === "інші варіанти" ||
    t === "ще аромати" ||
    t === "ще парфуми"
  ) {
    return true;
  }

  if (/\b(ще|далі)\b/.test(t) && /\b\d{1,2}\b/.test(t)) return true;
  if (/\b(дай|покажи|підбери|знайди)\b/.test(t) && /\b(ще|далі)\b/.test(t)) {
    return true;
  }
  if (hasSavedSearch && /\b(ще|далі)\b/.test(t)) return true;

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

async function sendItemsBatch(ctx, items) {
  const sent = [];
  const failed = [];

  for (const item of items) {
    try {
      const payload = buildPayloadWithExplanations(item);
      await sendPerfumeCard(ctx, payload, {
        notes: true,
        season: false,
      });
      sent.push(item);
    } catch (e) {
      console.error(
        "sendItemsBatch item failed:",
        item?.id,
        item?.name,
        e?.message || e,
      );
      failed.push(item);
    }
  }

  return { sent, failed };
}

function makeProfileWithGender(searchProfile, gender) {
  return {
    ...(searchProfile || {}),
    gender,
  };
}

function runFullDbSearch(searchProfile, gender, limit = 120) {
  const profile = gender
    ? makeProfileWithGender(searchProfile, gender)
    : { ...(searchProfile || {}) };

  return findCandidates(profile, limit);
}

/**
 * Робимо профіль для чесного порівняння схожості.
 *
 * Чому gender = "unknown":
 * - стать не має давати штучний бонус у match_score;
 * - стать має бути тільки фільтром дозволених категорій;
 * - так unisex з кращими нотами може стати вище female/male.
 */
function makeComparableSimilarityProfile(searchProfile) {
  return {
    ...(searchProfile || {}),
    gender: "unknown",
  };
}

/**
 * Пошук по дозволених статях.
 *
 * female-запит => female + unisex
 * male-запит   => male + unisex
 * unisex       => тільки unisex
 *
 * Порядок формується за match_score, тобто за схожістю нот/опису/акордів.
 */
function runAllowedGenderSimilaritySearch(
  searchProfile,
  allowedGenders = [],
  limit = 120,
) {
  const allowed = new Set(
    (allowedGenders || [])
      .map((x) => normalizeGenderValue(x))
      .filter((x) => x && x !== "unknown"),
  );

  const scanLimit = Math.max(
    Number(limit || 120) * 4,
    Number(SEARCH.MAX_ROWS_SCAN || 600),
  );

  const comparableProfile = makeComparableSimilarityProfile(searchProfile);
  const candidates = findCandidates(comparableProfile, scanLimit);

  const filtered = candidates.filter((item) => {
    const itemGender = normalizeGenderValue(item.gender);
    return allowed.has(itemGender);
  });

  return uniqById(filtered).slice(0, limit);
}

function extractUsefulTokens(text) {
  const stop = new Set([
    "я",
    "мені",
    "мене",
    "мій",
    "моя",
    "мої",
    "це",
    "цей",
    "ця",
    "такий",
    "така",
    "такий",
    "користуюсь",
    "користуюся",
    "підкажи",
    "підбери",
    "знайди",
    "щось",
    "схоже",
    "аромат",
    "парфум",
    "парфюмом",
    "парфумом",
    "духи",
    "потрібно",
    "хочу",
    "для",
    "і",
    "або",
    "на",
    "the",
    "and",
    "for",
    "with",
    "like",
  ]);

  return uniqStrings(
    String(text || "")
      .replace(/["'“”‘’()\[\],.!?:;\\/]+/g, " ")
      .split(/\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 3)
      .filter((x) => !stop.has(norm(x))),
  ).slice(0, 15);
}

function createRelaxedSearchProfile(searchProfile, analysis, userText) {
  const rawTerms = uniqStrings([
    ...safeArray(searchProfile?.raw_terms),
    ...safeArray(searchProfile?.notes_include),
    ...safeArray(searchProfile?.notes_prefer),
    ...safeArray(searchProfile?.accords),
    ...safeArray(searchProfile?.style_tags),
    ...safeArray(analysis?.search_terms),
    ...safeArray(analysis?.notes_top),
    ...safeArray(analysis?.notes_heart),
    ...safeArray(analysis?.notes_base),
    ...safeArray(analysis?.accords),
    ...safeArray(analysis?.style),
    analysis?.target_name,
    analysis?.brand,
    ...extractUsefulTokens(userText),
  ]).slice(0, 30);

  return {
    ...(searchProfile || {}),
    notes_include: uniqStrings([
      ...safeArray(searchProfile?.notes_include),
      ...safeArray(searchProfile?.notes_prefer),
      ...safeArray(analysis?.notes_top),
      ...safeArray(analysis?.notes_heart),
      ...safeArray(analysis?.notes_base),
    ]).slice(0, 18),
    notes_prefer: uniqStrings([
      ...safeArray(searchProfile?.notes_prefer),
      ...safeArray(analysis?.notes_top),
      ...safeArray(analysis?.notes_heart),
      ...safeArray(analysis?.notes_base),
    ]).slice(0, 18),
    accords: uniqStrings([
      ...safeArray(searchProfile?.accords),
      ...safeArray(analysis?.accords),
      ...safeArray(analysis?.style),
    ]).slice(0, 18),
    style_tags: uniqStrings([
      ...safeArray(searchProfile?.style_tags),
      ...safeArray(analysis?.style),
      ...safeArray(analysis?.accords),
    ]).slice(0, 18),
    raw_terms: rawTerms,
  };
}

function buildGenderPoolsFromFullDb(text, analysis, searchProfile) {
  const requestedGender = detectRequestedGender(text, analysis, searchProfile);
  const limit = SEARCH.LIMIT_CANDIDATES || 100;

  if (!requestedGender) {
    const allItems = runFullDbSearch(searchProfile, null, limit);

    return {
      requestedGender: null,
      primaryItems: uniqById(allItems),
      fallbackItems: [],
      allItems: uniqById(allItems),
      usedFallback: false,
    };
  }

  if (requestedGender === "female") {
    const allowedItems = runAllowedGenderSimilaritySearch(
      searchProfile,
      ["female", "unisex"],
      limit,
    );

    return {
      requestedGender,
      primaryItems: uniqById(allowedItems),
      fallbackItems: [],
      allItems: uniqById(allowedItems),
      usedFallback: false,
    };
  }

  if (requestedGender === "male") {
    const allowedItems = runAllowedGenderSimilaritySearch(
      searchProfile,
      ["male", "unisex"],
      limit,
    );

    return {
      requestedGender,
      primaryItems: uniqById(allowedItems),
      fallbackItems: [],
      allItems: uniqById(allowedItems),
      usedFallback: false,
    };
  }

  if (requestedGender === "unisex") {
    const unisexItems = runAllowedGenderSimilaritySearch(
      searchProfile,
      ["unisex"],
      limit,
    );

    return {
      requestedGender,
      primaryItems: uniqById(unisexItems),
      fallbackItems: [],
      allItems: uniqById(unisexItems),
      usedFallback: false,
    };
  }

  const allItems = runFullDbSearch(searchProfile, null, limit);

  return {
    requestedGender: null,
    primaryItems: uniqById(allItems),
    fallbackItems: [],
    allItems: uniqById(allItems),
    usedFallback: false,
  };
}

function isSpecificReferencePerfume(analysis) {
  const target = String(analysis?.target_name || "").trim();
  const brand = String(analysis?.brand || "").trim();

  if (!target) return false;
  if (brand && norm(target) === norm(brand)) return false;

  if (target.split(/\s+/).length >= 2) return true;

  if (
    safeArray(analysis?.notes_top).length ||
    safeArray(analysis?.notes_heart).length ||
    safeArray(analysis?.notes_base).length
  ) {
    return true;
  }

  return false;
}

function buildReferenceFallbackIntro(analysis) {
  const target = String(
    analysis?.target_name || analysis?.brand || "цей аромат",
  ).trim();

  const top = safeArray(analysis?.notes_top).slice(0, 4);
  const heart = safeArray(analysis?.notes_heart).slice(0, 4);
  const base = safeArray(analysis?.notes_base).slice(0, 4);

  const accords = uniqStrings([
    ...safeArray(analysis?.accords),
    ...safeArray(analysis?.style),
  ]).slice(0, 5);

  const seasons = safeArray(analysis?.seasons).slice(0, 4);

  const parts = [`🧴 Орієнтир: ${target}.`];

  if (accords.length) {
    parts.push(`✨ Загальний характер: ${accords.join(", ")}.`);
  }

  const noteLines = [];
  if (top.length) noteLines.push(`• верх: ${top.join(", ")}`);
  if (heart.length) noteLines.push(`• серце: ${heart.join(", ")}`);
  if (base.length) noteLines.push(`• база: ${base.join(", ")}`);

  if (noteLines.length) {
    parts.push(`\n🌿 Що вдалося розпізнати по нотах:\n${noteLines.join("\n")}`);
  }

  if (seasons.length) {
    parts.push(`\n🍂 Найкраще звучить у такі сезони: ${seasons.join(", ")}.`);
  }

  parts.push(
    "\nЗараз підберу з бази найближчі варіанти за характером, нотами та загальним напрямом.",
  );

  return parts.join("\n");
}

async function sendReferenceIntro(ctx, text, analysis) {
  if (analysis?.query_type !== "reference_perfume") {
    if (analysis?.user_friendly_reply) {
      await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
    }
    return;
  }

  if (!isSpecificReferencePerfume(analysis)) {
    const genericName = analysis?.brand || analysis?.target_name || "цей аромат";

    await ctx.reply(
      `🧴 Бачу орієнтир на ${genericName}, але без точної моделі аромат визначено занадто загально. Тому не буду вигадувати точні ноти — підберу найближчі варіанти з бази за стилем, асоціаціями та ключовими словами запиту.`,
    );

    return;
  }

  try {
    const introText = await writeReferencePerfumeIntro({
      userText: text,
      analysis,
    });

    if (introText) {
      await ctx.reply(introText);
      return;
    }
  } catch (e) {
    console.error("writeReferencePerfumeIntro error:", e);
  }

  const fallback = buildReferenceFallbackIntro(analysis);

  if (fallback) {
    await ctx.reply(fallback);
  } else if (analysis?.user_friendly_reply) {
    await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
  }
}

async function enrichAndRankItems({ items, text, analysis, searchProfile }) {
  let allItems = Array.isArray(items) ? uniqById(items) : [];
  if (!allItems.length) return [];

  allItems = rerankTopK(allItems, searchProfile, analysis?.target_name, 25);

  try {
    const gptSelected = await rerankAndExplain({
      userText: text,
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
    console.error("rerankAndExplain error:", e);
  }

  allItems = attachReasons(allItems, searchProfile);
  allItems = uniqById(allItems);

  return allItems;
}

async function runSearchWithFallbackProfiles({ text, analysis, searchProfile }) {
  const strictPools = buildGenderPoolsFromFullDb(text, analysis, searchProfile);

  if (strictPools.allItems?.length) {
    return {
      ...strictPools,
      searchProfileUsed: searchProfile,
      searchMode: "strict",
    };
  }

  const relaxedProfile = createRelaxedSearchProfile(searchProfile, analysis, text);
  const relaxedPools = buildGenderPoolsFromFullDb(text, analysis, relaxedProfile);

  if (relaxedPools.allItems?.length) {
    return {
      ...relaxedPools,
      searchProfileUsed: relaxedProfile,
      searchMode: "relaxed",
    };
  }

  const broadProfile = {
    ...relaxedProfile,
    gender: "unknown",
    exclude_tags: [],
    best_for: safeArray(relaxedProfile?.best_for),
  };

  const broadPools = buildGenderPoolsFromFullDb(text, analysis, broadProfile);

  return {
    ...broadPools,
    searchProfileUsed: broadProfile,
    searchMode: broadPools.allItems?.length ? "broad" : "empty",
  };
}

async function sendNextBatchFromState(ctx, saved, text = "") {
  if (!saved) {
    await ctx.reply(
      "ℹ️ Немає збереженого попереднього пошуку. Напишіть новий запит.",
    );
    return true;
  }

  const batchSize = parseBatchSize(text, 3);
  const sentIds = Array.isArray(saved.sentIds) ? saved.sentIds : [];
  const primaryItems = Array.isArray(saved.primaryItems) ? saved.primaryItems : [];
  const fallbackItems = Array.isArray(saved.fallbackItems)
    ? saved.fallbackItems
    : [];

  const orderedItems = primaryItems.length
    ? uniqById(primaryItems)
    : uniqById(fallbackItems);

  if (!orderedItems.length) {
    await ctx.reply("ℹ️ Немає збережених результатів. Напишіть новий запит.");
    clearLastSearch(ctx);
    return true;
  }

  const remainingPrimary = primaryItems.filter((x) => !sentIds.includes(x.id));
  const remainingFallback = fallbackItems.filter((x) => !sentIds.includes(x.id));

  let sourceLabel = "ще варіанти";
  let remaining = [];

  if (remainingPrimary.length) {
    remaining = remainingPrimary;
  } else if (!primaryItems.length && remainingFallback.length) {
    remaining = remainingFallback;

    if (saved.requestedGender === "female") {
      sourceLabel = "ще варіанти унісекс, бо жіночих не знайшлося";
    } else if (saved.requestedGender === "male") {
      sourceLabel = "ще варіанти унісекс, бо чоловічих не знайшлося";
    }
  }

  if (!remaining.length) {
    await ctx.reply("✅ Це були всі варіанти за попереднім запитом.");
    clearLastSearch(ctx);
    return true;
  }

  const safeRemaining = remaining.filter((x) => !sentIds.includes(x.id));
  const batch = safeRemaining.slice(0, batchSize);

  await ctx.reply(
    `🔎 Показую ${Math.min(batchSize, safeRemaining.length)} ${sourceLabel}:`,
  );

  const { sent, failed } = await sendItemsBatch(ctx, batch);
  const nextSentIds = [...sentIds, ...sent.map((x) => x.id)];

  if (failed.length) {
    console.error(
      "Next batch failed items:",
      failed.map((x) => ({ id: x.id, name: x.name })),
    );
  }

  setLastSearch(ctx, {
    ...saved,
    sentIds: nextSentIds,
    offset: nextSentIds.length,
  });

  const left = orderedItems.length - nextSentIds.length;

  if (left > 0) {
    await ctx.reply(`➡️ Ще залишилось ${left} варіантів. Напишіть: "ще"`);
  } else {
    await ctx.reply("✅ Це були всі варіанти за цим запитом.");
  }

  return true;
}

async function onUserText(ctx) {
  const mode = getMode(ctx);
  if (mode !== "pick") return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  const saved = getLastSearch(ctx);

  if (isFollowupForMore(text, Boolean(saved))) {
    return sendNextBatchFromState(ctx, saved, text);
  }

  incrementSearchCounterForActor(ctx);

  const exactByName = findByExactName(text);

  if (exactByName) {
    clearLastSearch(ctx);
    await ctx.reply(`✅ Знайшов точний збіг за назвою ${exactByName.name}:`);
    await sendPerfumeCard(ctx, exactByName, { notes: true, season: true });
    return true;
  }

  if (looksLikePerfumeCode(text)) {
    const code = normalizeCode(text);
    const byExactCode = findByNumberCode(code);

    if (byExactCode) {
      clearLastSearch(ctx);
      await ctx.reply(`✅ Знайшов аромат за кодом ${code}:`);
      await sendPerfumeCard(ctx, byExactCode, { notes: true, season: true });
      return true;
    }

    const num = extractNumericCode(code);

    if (num) {
      const byNumeric = findAllByNumericCode(num);

      if (byNumeric.length === 1) {
        clearLastSearch(ctx);
        await ctx.reply(
          `✅ Знайшов аромат за номером ${num}. У базі він записаний як ${byNumeric[0].number_code}:`,
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
          `🔎 За номером ${num} знайшов кілька варіантів:\n\n` +
          top
            .map((item, i) => `${i + 1}. ${item.number_code || "—"} — ${item.name}`)
            .join("\n") +
          `\n\n✍️ Напишіть точний код з буквою, наприклад: ${
            top[0]?.number_code || `${num}A`
          }`;

        await ctx.reply(listText);
        return true;
      }
    }

    await ctx.reply(
      `❌ Не знайшов аромат з кодом ${code}.\n\nСпробуйте:\n• інший код\n• назву аромату\n• ноти\n• або стиль`,
    );

    return true;
  }

  const startedAt = Date.now();

  const progressMsg = await createProgressMessage(
    ctx,
    "🔎 Пошук запущено...\n\n1/5 Аналізую запит",
  );

  try {
    await ctx.sendChatAction("typing");
  } catch {}

  let analysis;

  try {
    analysis = await analyzePerfumeIntent(text);
  } catch (e) {
    console.error("analyzePerfumeIntent error:", e);
    await updateProgressMessage(ctx, progressMsg, "❌ Не вдалося проаналізувати запит.");
    await ctx.reply("❌ Не вдалося проаналізувати запит.");
    return true;
  }

  if (!hasSearchData(analysis)) {
    await updateProgressMessage(ctx, progressMsg, "ℹ️ Запит недостатньо конкретний.");
    await ctx.reply(
      analysis?.user_friendly_reply ||
        "🤔 Не до кінця зрозумів запит.\n\nНапишіть:\n• назву аромату\n• код\n• ноти\n• стиль\n• або ситуацію використання",
    );
    return true;
  }

  await sendReferenceIntro(ctx, text, analysis);

  await updateProgressMessage(
    ctx,
    progressMsg,
    "🔎 Пошук запущено...\n\n1/5 Запит розібрано\n2/5 Будую профіль пошуку",
  );

  try {
    await ctx.sendChatAction("typing");
  } catch {}

  let searchProfile;

  try {
    searchProfile = await buildSearchProfile(analysis);
  } catch (e) {
    console.error("buildSearchProfile error:", e);
    await updateProgressMessage(
      ctx,
      progressMsg,
      "❌ Не вдалося побудувати профіль пошуку.",
    );
    await ctx.reply("❌ Не вдалося побудувати профіль пошуку.");
    return true;
  }

  await updateProgressMessage(
    ctx,
    progressMsg,
    "🔎 Пошук запущено...\n\n1/5 Запит розібрано\n2/5 Профіль побудовано\n3/5 Шукаю кандидати в базі",
  );

  try {
    await ctx.sendChatAction("typing");
  } catch {}

  let searchPools;

  try {
    searchPools = await runSearchWithFallbackProfiles({
      text,
      analysis,
      searchProfile,
    });

    console.log("SEARCH DEBUG", {
      userText: text,
      requestedGender: searchPools?.requestedGender || null,
      primaryCount: Array.isArray(searchPools?.primaryItems)
        ? searchPools.primaryItems.length
        : 0,
      fallbackCount: Array.isArray(searchPools?.fallbackItems)
        ? searchPools.fallbackItems.length
        : 0,
      allCount: Array.isArray(searchPools?.allItems)
        ? searchPools.allItems.length
        : 0,
      analysisQueryType: analysis?.query_type || null,
      searchProfileGender: searchProfile?.gender || null,
      searchMode: searchPools?.searchMode || null,
      targetName: analysis?.target_name || null,
      brand: analysis?.brand || null,
    });
  } catch (e) {
    console.error("runSearchWithFallbackProfiles error:", e);
    await updateProgressMessage(ctx, progressMsg, "❌ Помилка пошуку в базі.");
    await ctx.reply("❌ Помилка пошуку в базі.");
    return true;
  }

  const requestedGender = searchPools.requestedGender;
  const usedFallback = Boolean(searchPools.usedFallback);
  const effectiveSearchProfile = searchPools.searchProfileUsed || searchProfile;

  let primaryItems = [];
  let fallbackItems = [];

  await updateProgressMessage(
    ctx,
    progressMsg,
    "🔎 Пошук запущено...\n\n1/5 Запит розібрано\n2/5 Профіль побудовано\n3/5 Кандидати знайдені\n4/5 Роблю фінальний відбір",
  );

  try {
    await ctx.sendChatAction("typing");
  } catch {}

  try {
    primaryItems = await enrichAndRankItems({
      items: searchPools.primaryItems,
      text,
      analysis,
      searchProfile: effectiveSearchProfile,
    });

    if (!primaryItems.length) {
      fallbackItems = await enrichAndRankItems({
        items: searchPools.fallbackItems,
        text,
        analysis,
        searchProfile: effectiveSearchProfile,
      });
    }
  } catch (e) {
    console.error("enrichAndRankItems error:", e);
    await updateProgressMessage(ctx, progressMsg, "❌ Помилка фінального відбору.");
    await ctx.reply("❌ Помилка фінального відбору.");
    return true;
  }

  const allItems = uniqById(primaryItems.length ? primaryItems : fallbackItems);

  if (!allItems.length) {
    if (
      analysis?.query_type === "reference_perfume" &&
      !isSpecificReferencePerfume(analysis)
    ) {
      await updateProgressMessage(
        ctx,
        progressMsg,
        "😔 Конкретних збігів не знайдено.",
      );
      await ctx.reply(
        "😔 Не знайшов переконливих аналогів, бо в запиті немає точної назви аромату. Напишіть повну модель, наприклад: Black Opium, Libre, Y, La Nuit de L'Homme — тоді підбір буде набагато точнішим.",
      );
      return true;
    }

    if (requestedGender === "female") {
      await updateProgressMessage(
        ctx,
        progressMsg,
        "❌ Жіночі або унісекс варіанти не знайдено.",
      );
      await ctx.reply(
        "❌ Не знайшов жіночих або унісекс ароматів за цим запитом. Уточніть ноти або стиль.",
      );
      return true;
    }

    if (requestedGender === "male") {
      await updateProgressMessage(
        ctx,
        progressMsg,
        "❌ Чоловічі або унісекс варіанти не знайдено.",
      );
      await ctx.reply(
        "❌ Не знайшов чоловічих або унісекс ароматів за цим запитом. Уточніть ноти або стиль.",
      );
      return true;
    }

    if (requestedGender === "unisex") {
      await updateProgressMessage(
        ctx,
        progressMsg,
        "❌ Унісекс варіанти не знайдено.",
      );
      await ctx.reply(
        "❌ За запитом не знайшов відповідних унісекс ароматів. Уточніть ноти або стиль.",
      );
      return true;
    }

    await updateProgressMessage(ctx, progressMsg, "😔 Вдалих збігів не знайдено.");
    await ctx.reply(
      "😔 У базі поки не знайшов вдалих збігів.\n\nМожете уточнити:\n• для кого аромат\n• які ноти\n• який стиль\n• на яку ситуацію\n• який шлейф або стійкість",
    );
    return true;
  }

  setLastSearch(ctx, {
    originalText: text,
    analysis,
    searchProfile: effectiveSearchProfile,
    requestedGender,
    primaryItems,
    fallbackItems,
    allItems,
    offset: 0,
    sentIds: [],
    usedFallback,
  });

  const firstPool = primaryItems.length ? primaryItems : fallbackItems;
  const firstBatch = firstPool.slice(0, 3);

  if (!firstBatch.length) {
    await updateProgressMessage(
      ctx,
      progressMsg,
      "❌ Не вдалося сформувати першу видачу.",
    );
    await ctx.reply("❌ Не вдалося сформувати першу видачу.");
    return true;
  }

  if (searchPools.searchMode === "relaxed") {
    await ctx.reply(
      "ℹ️ Точний збіг був слабкий, тому я розширив пошук і підібрав найближчі варіанти за нотами та характером.",
    );
  } else if (searchPools.searchMode === "broad") {
    await ctx.reply(
      "ℹ️ Точних збігів у вузькому пошуку не було, тому я показую найближчі варіанти з ширшого підбору.",
    );
  }

  await updateProgressMessage(
    ctx,
    progressMsg,
    "🔎 Пошук запущено...\n\n1/5 Запит розібрано\n2/5 Профіль побудовано\n3/5 Кандидати знайдені\n4/5 Відбір завершено\n5/5 Надсилаю результати",
  );

  await ctx.reply(`✨ Підібрав ${Math.min(3, firstBatch.length)} найбільш схожі варіанти:`);

  const { sent, failed } = await sendItemsBatch(ctx, firstBatch);
  const sentIds = sent.map((x) => x.id);
  const offset = sentIds.length;

  if (failed.length) {
    console.error(
      "First batch failed items:",
      failed.map((x) => ({ id: x.id, name: x.name })),
    );
  }

  setLastSearch(ctx, {
    originalText: text,
    analysis,
    searchProfile: effectiveSearchProfile,
    requestedGender,
    primaryItems,
    fallbackItems,
    allItems,
    offset,
    sentIds,
    usedFallback,
  });

  const totalMs = Date.now() - startedAt;

  await updateProgressMessage(
    ctx,
    progressMsg,
    `✅ Пошук завершено за ${formatMs(totalMs)}`,
  );

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