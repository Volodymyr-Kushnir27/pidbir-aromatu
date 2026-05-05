const { norm } = require("../utils/text");

function hasWord(text, word) {
  return new RegExp(`\\b${word}\\b`, "i").test(String(text || ""));
}

function normalizeGenderValue(value) {
  const g = norm(String(value || ""));

  if (!g) return "unknown";

  // 1. Спочатку unisex, щоб "unisex for women/men" не ламався
  if (
    g.includes("унісекс") ||
    g.includes("унисекс") ||
    hasWord(g, "unisex")
  ) {
    return "unisex";
  }

  // 2. Потім female
  if (
    g.includes("жіноч") ||
    g.includes("женск") ||
    hasWord(g, "female") ||
    hasWord(g, "women") ||
    hasWord(g, "woman")
  ) {
    return "female";
  }

  // 3. Потім male
  if (
    g.includes("чолов") ||
    g.includes("мужск") ||
    hasWord(g, "male") ||
    hasWord(g, "men") ||
    hasWord(g, "man")
  ) {
    return "male";
  }

  return "unknown";
}

function getGenderBucket(requestedGender, itemGender) {
  const req = normalizeGenderValue(requestedGender);
  const item = normalizeGenderValue(itemGender);

  // Якщо стать явно задана:
  // female -> unisex + female, але male йде в заборонений бакет
  // male   -> unisex + male, але female йде в заборонений бакет
  if (req === "female") {
    if (item === "unisex") return 0;
    if (item === "female") return 1;
    return 99;
  }

  if (req === "male") {
    if (item === "unisex") return 0;
    if (item === "male") return 1;
    return 99;
  }

  if (req === "unisex") {
    if (item === "unisex") return 0;
    return 99;
  }

  // Якщо стать НЕ задана:
  // спочатку unisex, потім female, потім male, потім unknown.
  if (item === "unisex") return 0;
  if (item === "female") return 1;
  if (item === "male") return 2;
  return 3;
}

function rerankTopK(candidates, profile, targetName = "", topK = 3, offset = 0) {
  const seen = new Set();
  const filtered = [];
  const baseName = norm(targetName || "");
  const requestedGender = profile?.gender || "unknown";

  for (const item of candidates || []) {
    const key = norm(`${item.number_code || ""}|${item.name || ""}`);
    if (!key || seen.has(key)) continue;

    const itemName = norm(item.name || "");
    if (baseName && itemName && itemName === baseName) continue;

    const genderBucket = getGenderBucket(requestedGender, item.gender);

    // Якщо стать явно задана — чужу стать не пускаємо в топ.
    const req = normalizeGenderValue(requestedGender);
    if ((req === "male" || req === "female" || req === "unisex") && genderBucket >= 99) {
      continue;
    }

    seen.add(key);

    filtered.push({
      ...item,
      _gender_bucket: genderBucket,
    });
  }

  filtered.sort((a, b) => {
    const aScore = Number(a.match_score || 0);
    const bScore = Number(b.match_score || 0);

    // Якщо стать не задана — головне правило:
    // 1) unisex
    // 2) female
    // 3) male
    // всередині кожної групи — за score.
    const req = normalizeGenderValue(requestedGender);
    if (req === "unknown" && a._gender_bucket !== b._gender_bucket) {
      return a._gender_bucket - b._gender_bucket;
    }

    // Якщо стать задана — спочатку score, стать тільки тайбрейкер.
    if (aScore !== bScore) {
      return bScore - aScore;
    }

    if (a._gender_bucket !== b._gender_bucket) {
      return a._gender_bucket - b._gender_bucket;
    }

    // Рандомність НЕ тут. Тут стабільний fallback.
    return Number(a.id || 0) - Number(b.id || 0);
  });

  return filtered
    .slice(offset, offset + topK)
    .map(({ _gender_bucket, ...item }) => item);
}

module.exports = {
  rerankTopK,
  normalizeGenderValue,
  getGenderBucket,
};
