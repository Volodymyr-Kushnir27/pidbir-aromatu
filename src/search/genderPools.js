const { normalizeGenderValue } = require("./candidateRerank");

function uniqById(items = []) {
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

function normalizeScore(item) {
  return Number(item?.match_score || 0);
}

/**
 * Реальний random, не seeded.
 * Тому при кожному однаковому запиті порядок всередині групи буде інший.
 */
function shuffleRandom(items = []) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

/**
 * Не мішати весь каталог безконтрольно.
 * Спочатку беремо тільки релевантні позиції:
 * - score > 0
 * - або score близький до найкращого в цій gender-групі.
 */
function preparePool(items = [], windowSize = 40) {
  const clean = uniqById(items)
    .filter((x) => normalizeScore(x) > 0)
    .sort((a, b) => {
      const diff = normalizeScore(b) - normalizeScore(a);
      if (diff !== 0) return diff;
      return Number(a.id || 0) - Number(b.id || 0);
    });

  if (!clean.length) return [];

  const best = normalizeScore(clean[0]);
  const close = clean.filter((item) => normalizeScore(item) >= best * 0.65);
  const pool = (close.length >= 3 ? close : clean).slice(0, windowSize);
  const poolIds = new Set(pool.map((x) => Number(x.id)));
  const rest = clean.filter((x) => !poolIds.has(Number(x.id)));

  return [...shuffleRandom(pool), ...rest];
}

/**
 * Головна логіка видачі.
 *
 * Якщо стать НЕ задана:
 * 1. підходящі unisex -> рандомно
 * 2. підходящі female -> рандомно
 * 3. підходящі male -> рандомно
 * 4. unknown -> в кінець
 *
 * Якщо стать задана:
 * male   -> male + unisex, female повністю блокується
 * female -> female + unisex, male повністю блокується
 * unisex -> тільки unisex
 */
function buildGenderOrderedRandomResults(items = [], requestedGender = null, options = {}) {
  const windowSize = Number(options.windowSize || process.env.APPROX_RANDOM_WINDOW || 40);
  const req = normalizeGenderValue(requestedGender);

  const unique = uniqById(items).filter((x) => normalizeScore(x) > 0);

  const buckets = {
    unisex: [],
    female: [],
    male: [],
    unknown: [],
  };

  for (const item of unique) {
    const g = normalizeGenderValue(item.gender);
    if (g === "unisex") buckets.unisex.push(item);
    else if (g === "female") buckets.female.push(item);
    else if (g === "male") buckets.male.push(item);
    else buckets.unknown.push(item);
  }

  if (req === "male") {
    return uniqById([
      ...preparePool(buckets.male, windowSize),
      ...preparePool(buckets.unisex, windowSize),
    ]);
  }

  if (req === "female") {
    return uniqById([
      ...preparePool(buckets.female, windowSize),
      ...preparePool(buckets.unisex, windowSize),
    ]);
  }

  if (req === "unisex") {
    return preparePool(buckets.unisex, windowSize);
  }

  return uniqById([
    ...preparePool(buckets.unisex, windowSize),
    ...preparePool(buckets.female, windowSize),
    ...preparePool(buckets.male, windowSize),
    ...preparePool(buckets.unknown, windowSize),
  ]);
}

module.exports = {
  shuffleRandom,
  buildGenderOrderedRandomResults,
};
