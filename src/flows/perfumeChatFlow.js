const { SEARCH, ADMINS_PATH, USERS_PATH } = require("../config");
const { PICK_MODE_HELP } = require("../ui/messages");

const { analyzePerfumeIntent } = require("../llm/perfumeAnalyzer");
const { writeReferencePerfumeIntro } = require("../llm/writeReferencePerfumeIntro");
const { buildSearchProfile } = require("../llm/perfumeSearchProfile");
const { attachReasons } = require("../llm/resultExplainer");
const { rerankAndExplain } = require("../llm/rerankExplainer");
const {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
} = require("../search/directNameKeywordSearch");

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

const CLOSE_SCORE_DELTA_FOR_UNISEX = Number(
  process.env.UNISEX_PRIORITY_DELTA || 80,
);

const MIN_STRICT_SCORE = Number(process.env.SEARCH_MIN_STRICT_SCORE || 8);
const MIN_RELAXED_SCORE = Number(process.env.SEARCH_MIN_RELAXED_SCORE || 4);
const APPROX_RANDOM_WINDOW = Number(process.env.APPROX_RANDOM_WINDOW || 30);

/* =========================
   State helpers
========================= */

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

/* =========================
   Common helpers
========================= */

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

function formatMs(ms) {
  if (!ms || ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

function normalizeScore(item) {
  return Number(item?.match_score || 0);
}

function isPositiveScore(item, minScore = 1) {
  return normalizeScore(item) >= minScore;
}

function makeSeedFromText(text) {
  const s = norm(text);
  let hash = 2166136261;

  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function seededRandom(seed) {
  let x = Number(seed || 1) || 1;

  return function next() {
    x += 0x6d2b79f5;
    let t = x;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items = [], seedText = "") {
  const arr = [...items];
  const rnd = seededRandom(makeSeedFromText(seedText));

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function randomizeApproximatePool(items = [], text = "", windowSize = 30) {
  const clean = uniqById(items)
    .filter((x) => normalizeScore(x) > 0)
    .sort((a, b) => {
      const diff = normalizeScore(b) - normalizeScore(a);
      if (diff !== 0) return diff;
      return Number(a.id || 0) - Number(b.id || 0);
    });

  if (!clean.length) return [];

  const bestScore = normalizeScore(clean[0]);

  const closeEnough = clean.filter((item) => {
    const score = normalizeScore(item);
    return score >= bestScore * 0.65;
  });

  const pool =
    closeEnough.length >= 6
      ? closeEnough.slice(0, windowSize)
      : clean.slice(0, windowSize);

  const shuffledPool = shuffleWithSeed(pool, text);

  const poolIds = new Set(shuffledPool.map((x) => Number(x.id)));
  const rest = clean.filter((x) => !poolIds.has(Number(x.id)));

  return [...shuffledPool, ...rest];
}

/* =========================
   Gender logic
========================= */

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
    .map((x) => normalizeGenderValue(x));

  for (const g of candidates) {
    if (g === "female") return "female";
    if (g === "male") return "male";
    if (g === "unisex") return "unisex";
  }

  return null;
}

function getAllowedGenderSet(requestedGender) {
  const req = normalizeGenderValue(requestedGender);

  if (req === "female") return new Set(["female", "unisex"]);
  if (req === "male") return new Set(["male", "unisex"]);
  if (req === "unisex") return new Set(["unisex"]);

  return null;
}

function filterAllowedGender(items = [], requestedGender = null) {
  const allowed = getAllowedGenderSet(requestedGender);
  if (!allowed) return items || [];

  return (items || []).filter((item) =>
    allowed.has(normalizeGenderValue(item.gender)),
  );
}

/**
 * Головне правило:
 * - спочатку схожість;
 * - якщо score однаковий або дуже близький, unisex іде вище female/male;
 * - якщо female/male явно точніший по нотах, він лишається вище.
 */
function sortBySimilarityWithUnisexPriority(
  items = [],
  requestedGender = null,
  closeDelta = CLOSE_SCORE_DELTA_FOR_UNISEX,
) {
  const req = normalizeGenderValue(requestedGender);

  return uniqById(items).sort((a, b) => {
    const as = normalizeScore(a);
    const bs = normalizeScore(b);
    const diff = bs - as;

    const aGender = normalizeGenderValue(a.gender);
    const bGender = normalizeGenderValue(b.gender);

    const canPreferUnisex =
      req === "female" || req === "male" || req === "unknown" || !req;

    const scoreIsClose = Math.abs(as - bs) <= closeDelta;

    if (canPreferUnisex && scoreIsClose && aGender !== bGender) {
      if (aGender === "unisex") return -1;
      if (bGender === "unisex") return 1;
    }

    if (diff !== 0) return diff;

    return Number(a.id || 0) - Number(b.id || 0);
  });
}

/* =========================
   Messages / payload
========================= */

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

function buildApproximateNoExactReply(analysis, searchProfile) {
  const terms = uniqStrings([
    ...safeArray(analysis?.search_terms),
    ...safeArray(analysis?.notes_top),
    ...safeArray(analysis?.notes_heart),
    ...safeArray(analysis?.notes_base),
    ...safeArray(analysis?.accords),
    ...safeArray(analysis?.style),
    ...safeArray(searchProfile?.notes_include),
    ...safeArray(searchProfile?.notes_prefer),
    ...safeArray(searchProfile?.accords),
    ...safeArray(searchProfile?.style_tags),
  ]).slice(0, 8);

  const tail = terms.length
    ? `\n\nAI розібрав запит як: ${terms.join(", ")}.`
    : "";

  return (
    "ℹ️ Точного збігу в базі не знайшов.\n" +
    "Перевірив назву, ноти, ключові слова, опис і стиль аромату.\n" +
    "Показую приблизно схожі варіанти з бази — не точний збіг, а найближчий напрям." +
    tail
  );
}

function renderMetaComment() {
  return "";
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

/* =========================
   Search helpers
========================= */

function makeProfileWithGender(searchProfile, gender) {
  return {
    ...(searchProfile || {}),
    gender,
  };
}

function makeComparableSimilarityProfile(searchProfile) {
  return {
    ...(searchProfile || {}),
    // gender не дає бонус у score.
    // Стать працює тільки як allowed-filter.
    gender: "unknown",
  };
}

function runFullDbSearch(searchProfile, gender, limit = 120) {
  const profile = gender
    ? makeProfileWithGender(searchProfile, gender)
    : { ...(searchProfile || {}) };

  return findCandidates(profile, limit);
}

function runAllowedGenderSimilaritySearch(
  searchProfile,
  allowedGenders = [],
  requestedGender = null,
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

  return sortBySimilarityWithUnisexPriority(
    uniqById(filtered),
    requestedGender,
  ).slice(0, limit);
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
    "користуюсь",
    "користуюся",
    "підкажи",
    "підбери",
    "знайди",
    "щось",
    "схоже",
    "аромат",
    "аромату",
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
      .replace(/["'“”‘’()[\],.!?:;\\/]+/g, " ")
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

function filterMeaningfulItems(items = [], minScore = 1) {
  return uniqById(items).filter((item) => isPositiveScore(item, minScore));
}

function buildGenderPoolsFromFullDb(text, analysis, searchProfile, options = {}) {
  const requestedGender = detectRequestedGender(text, analysis, searchProfile);
  const limit = options.limit || SEARCH.LIMIT_CANDIDATES || 100;
  const minScore = options.minScore || 1;

  let allItems = [];

  if (!requestedGender) {
    allItems = runFullDbSearch(searchProfile, null, limit);
  } else if (requestedGender === "female") {
    allItems = runAllowedGenderSimilaritySearch(
      searchProfile,
      ["female", "unisex"],
      requestedGender,
      limit,
    );
  } else if (requestedGender === "male") {
    allItems = runAllowedGenderSimilaritySearch(
      searchProfile,
      ["male", "unisex"],
      requestedGender,
      limit,
    );
  } else if (requestedGender === "unisex") {
    allItems = runAllowedGenderSimilaritySearch(
      searchProfile,
      ["unisex"],
      requestedGender,
      limit,
    );
  } else {
    allItems = runFullDbSearch(searchProfile, null, limit);
  }

  allItems = filterAllowedGender(allItems, requestedGender);
  allItems = sortBySimilarityWithUnisexPriority(
    filterMeaningfulItems(allItems, minScore),
    requestedGender,
  );

  return {
    requestedGender,
    primaryItems: uniqById(allItems),
    fallbackItems: [],
    allItems: uniqById(allItems),
    usedFallback: false,
  };
}

async function runSearchWithFallbackProfiles({ text, analysis, searchProfile }) {
  const strictPools = buildGenderPoolsFromFullDb(text, analysis, searchProfile, {
    minScore: MIN_STRICT_SCORE,
  });

  if (strictPools.allItems?.length) {
    return {
      ...strictPools,
      searchProfileUsed: searchProfile,
      searchMode: "strict",
      approximate: false,
    };
  }

  const relaxedProfile = createRelaxedSearchProfile(searchProfile, analysis, text);
  const relaxedPools = buildGenderPoolsFromFullDb(text, analysis, relaxedProfile, {
    minScore: MIN_RELAXED_SCORE,
  });

  if (relaxedPools.allItems?.length) {
    const randomizedItems = randomizeApproximatePool(
      relaxedPools.allItems,
      text,
      APPROX_RANDOM_WINDOW,
    );

    return {
      ...relaxedPools,
      primaryItems: randomizedItems,
      allItems: randomizedItems,
      searchProfileUsed: relaxedProfile,
      searchMode: "relaxed",
      approximate: true,
    };
  }

  const broadProfile = {
    ...relaxedProfile,
    gender: "unknown",
    exclude_tags: [],
    best_for: safeArray(relaxedProfile?.best_for),
  };

  const broadPools = buildGenderPoolsFromFullDb(text, analysis, broadProfile, {
    minScore: 1,
  });

  if (broadPools.allItems?.length) {
    const randomizedItems = randomizeApproximatePool(
      broadPools.allItems,
      text,
      APPROX_RANDOM_WINDOW,
    );

    return {
      ...broadPools,
      primaryItems: randomizedItems,
      allItems: randomizedItems,
      searchProfileUsed: broadProfile,
      searchMode: "broad",
      approximate: true,
    };
  }

  return {
    ...broadPools,
    searchProfileUsed: broadProfile,
    searchMode: "empty",
    approximate: true,
  };
}

/* =========================
   Reference intro
========================= */

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
    console.error("writeReferencePerfumeIntro error:", e?.message || e);
  }

  const fallback = buildReferenceFallbackIntro(analysis);

  if (fallback) {
    await ctx.reply(fallback);
  } else if (analysis?.user_friendly_reply) {
    await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
  }
}

/* =========================
   Ranking
========================= */

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

async function enrichAndRankItems({
  items,
  text,
  analysis,
  searchProfile,
  requestedGender = null,
  approximate = false,
}) {
  let allItems = Array.isArray(items) ? uniqById(items) : [];
  if (!allItems.length) return [];

  allItems = filterAllowedGender(allItems, requestedGender);

  allItems = rerankTopK(
    allItems,
    {
      ...(searchProfile || {}),
      // Для чесного rerank стать не має давати бонус.
      gender: "unknown",
    },
    analysis?.target_name,
    25,
  );

  allItems = sortBySimilarityWithUnisexPriority(allItems, requestedGender);

  if (approximate) {
    allItems = randomizeApproximatePool(allItems, text, 18);
  }

  // Для approximate fallback не даємо GPT повністю переставляти список,
  // щоб не повертатися до одного й того самого першого аромату.
  if (!approximate) {
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
        allItems = sortBySimilarityWithUnisexPriority(allItems, requestedGender);
      }
    } catch (e) {
      console.error("rerankAndExplain error:", e?.message || e);
    }
  }

  allItems = attachReasons(allItems, searchProfile);
  allItems = uniqById(allItems);

  return allItems;
}

/* =========================
   More results flow
========================= */

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

  if (
    /\b(дай|покажи|підбери|знайди)\b/.test(t) &&
    /\b(ще|далі)\b/.test(t)
  ) {
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

async function sendNextBatchFromState(ctx, saved, text = "") {
  if (!saved) {
    await ctx.reply(
      "ℹ️ Немає збереженого попереднього пошуку. Напишіть новий запит.",
    );
    return true;
  }

  const batchSize = parseBatchSize(text, 3);
  const sentIds = Array.isArray(saved.sentIds) ? saved.sentIds : [];

  const primaryItems = Array.isArray(saved.primaryItems)
    ? saved.primaryItems
    : [];

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

/* =========================
   Main text handler
========================= */

async function sendCodeMatches(ctx, text) {
  if (!looksLikePerfumeCode(text)) return false;

  const code = normalizeCode(text);
  const byExactCode = findByNumberCode(code);

  if (byExactCode) {
    clearLastSearch(ctx);
    await ctx.reply(`✅ Знайшов аромат за кодом ${code}:`);
    await sendPerfumeCard(ctx, byExactCode, { notes: true, season: true });
    return true;
  }

  const numericCode = extractNumericCode(code);
  const numericMatches = findAllByNumericCode(numericCode);

  if (numericMatches.length) {
    clearLastSearch(ctx);

    await ctx.reply(
      `✅ Знайшов ${numericMatches.length} варіанти за номером ${numericCode}:`,
    );

    const batch = numericMatches.slice(0, 5);
    await sendItemsBatch(ctx, batch);

    if (numericMatches.length > batch.length) {
      setLastSearch(ctx, {
        query: text,
        primaryItems: numericMatches,
        fallbackItems: [],
        sentIds: batch.map((x) => x.id),
        requestedGender: null,
        approximate: false,
      });

      await ctx.reply(
        `➡️ Є ще ${numericMatches.length - batch.length} варіантів. Напишіть: "ще"`,
      );
    }

    return true;
  }

  return false;
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

  const handledCode = await sendCodeMatches(ctx, text);
if (handledCode) return true;

/**
 * Direct name / keywords search.
 *
 * Це перший рівень пошуку:
 * - назва
 * - keywords
 * - version
 * - description
 * - notes
 *
 * Приклад:
 * "Габа" →
 * 1. точний GABA / Габа
 * 2. Hormone GABA
 * 3. слабші збіги типу Gabbana
 */
const directMatches = searchByNameAndKeywords(text, {
  limit: SEARCH.LIMIT_CANDIDATES || 100,
  minScore: 1200,
});

if (hasStrongDirectMatch(directMatches)) {
  clearLastSearch(ctx);

  const firstBatch = directMatches.slice(0, 3);

  await ctx.reply(
    `✅ Знайшов ${directMatches.length} варіанти за назвою / ключовими словами.\n\nСпочатку показую 100% збіги, далі — менш точні.`,
  );

  const { sent, failed } = await sendItemsBatch(ctx, firstBatch);

  if (failed.length) {
    console.error(
      "Direct search failed items:",
      failed.map((x) => ({ id: x.id, name: x.name })),
    );
  }

  const sentIds = sent.map((x) => x.id);

  setLastSearch(ctx, {
    query: text,
    analysis: null,
    searchProfile: null,
    requestedGender: null,
    searchMode: "direct_name_keyword",
    approximate: false,

    primaryItems: directMatches,
    fallbackItems: [],
    sentIds,
    offset: sentIds.length,
  });

  const left = directMatches.length - sentIds.length;

  if (left > 0) {
    await ctx.reply(`➡️ Є ще ${left} варіантів. Напишіть: "ще" або "дай ще 3"`);
  } else {
    await ctx.reply("✅ Це всі знайдені варіанти за цим запитом.");
  }

  return true;
}

// Якщо точного direct-збігу немає, але старий exactByName щось знайшов — показуємо його.
const exactByName = findByExactName(text);

if (exactByName) {
  clearLastSearch(ctx);
  await ctx.reply(`✅ Знайшов точний збіг за назвою ${exactByName.name}:`);
  await sendPerfumeCard(ctx, exactByName, { notes: true, season: true });
  return true;
}

  const startedAt = Date.now();

  const progressMsg = await createProgressMessage(
    ctx,
    "🔎 AI-підбір запущено...\n\n1/5 Перевіряю базу\n2/5 Аналізую запит як парфумерний консультант",
  );

  let analysis = null;
  let searchProfile = null;
  let searchResult = null;
  let allItems = [];

  try {
    analysis = await analyzePerfumeIntent(text);

    await updateProgressMessage(
      ctx,
      progressMsg,
      "🔎 AI-підбір запущено...\n\n1/5 БД перевірено\n2/5 Запит розібрано\n3/5 Будую пошуковий профіль",
    );

    searchProfile = await buildSearchProfile(analysis);

    await updateProgressMessage(
      ctx,
      progressMsg,
      "🔎 AI-підбір запущено...\n\n1/5 БД перевірено\n2/5 Запит розібрано\n3/5 Профіль готовий\n4/5 Шукаю в базі",
    );

    searchResult = await runSearchWithFallbackProfiles({
      text,
      analysis,
      searchProfile,
    });

    const activeProfile = searchResult.searchProfileUsed || searchProfile;

    if (!searchResult.allItems?.length) {
      clearLastSearch(ctx);

      await updateProgressMessage(
        ctx,
        progressMsg,
        `✅ AI-підбір завершено за ${formatMs(Date.now() - startedAt)}`,
      );

      await ctx.reply(
        "😔 Вдалих збігів не знайдено.\n\nЯ перевірив назву, ноти, ключові слова, опис і стиль аромату, але в базі немає навіть приблизно релевантного напряму.",
      );

      return true;
    }

    if (searchResult.approximate) {
      await ctx.reply(buildApproximateNoExactReply(analysis, activeProfile));
    }

    if (analysis?.query_type === "reference_perfume") {
      await sendReferenceIntro(ctx, text, analysis);
    } else if (!searchResult.approximate && analysis?.user_friendly_reply) {
      await ctx.reply(`✨ ${analysis.user_friendly_reply}`);
    }

    await updateProgressMessage(
      ctx,
      progressMsg,
      "🔎 AI-підбір запущено...\n\n1/5 БД перевірено\n2/5 Запит розібрано\n3/5 Профіль готовий\n4/5 Кандидати знайдені\n5/5 Роблю фінальний відбір",
    );

    allItems = await enrichAndRankItems({
      items: searchResult.allItems,
      text,
      analysis,
      searchProfile: activeProfile,
      requestedGender: searchResult.requestedGender,
      approximate: Boolean(searchResult.approximate),
    });

    if (!allItems.length) {
      clearLastSearch(ctx);

      await updateProgressMessage(
        ctx,
        progressMsg,
        `✅ AI-підбір завершено за ${formatMs(Date.now() - startedAt)}`,
      );

      await ctx.reply("😔 Вдалих збігів не знайдено.");
      return true;
    }

    const firstBatch = allItems.slice(0, 3);

    await updateProgressMessage(
      ctx,
      progressMsg,
      `✅ AI-підбір завершено за ${formatMs(Date.now() - startedAt)}`,
    );

    if (searchResult.approximate) {
      await ctx.reply("✨ Підібрав 3 приблизно схожі варіанти з бази:");
    } else {
      await ctx.reply("✨ Підібрав 3 найбільш схожі варіанти:");
    }

    const { sent, failed } = await sendItemsBatch(ctx, firstBatch);

    if (failed.length) {
      console.error(
        "First batch failed items:",
        failed.map((x) => ({ id: x.id, name: x.name })),
      );
    }

    const sentIds = sent.map((x) => x.id);

    setLastSearch(ctx, {
      query: text,
      analysis,
      searchProfile: activeProfile,
      requestedGender: searchResult.requestedGender,
      searchMode: searchResult.searchMode,
      approximate: Boolean(searchResult.approximate),

      primaryItems: allItems,
      fallbackItems: [],
      sentIds,
      offset: sentIds.length,
    });

    const left = allItems.length - sentIds.length;

    if (left > 0) {
      await ctx.reply(`➡️ Є ще ${left} варіантів. Напишіть: "ще" або "дай ще 3"`);
    } else {
      await ctx.reply("✅ Це всі знайдені варіанти за цим запитом.");
    }

    return true;
  } catch (e) {
    console.error("onUserText perfume search error:", e?.message || e);

    clearLastSearch(ctx);

    await updateProgressMessage(
      ctx,
      progressMsg,
      `⚠️ Помилка підбору після ${formatMs(Date.now() - startedAt)}`,
    );

    await ctx.reply(
      "⚠️ Не вдалося виконати підбір. Спробуйте коротший запит або повторіть ще раз.",
    );

    return true;
  }
}

module.exports = {
  onUserPickAction,
  onUserText,
  disableMode,
};