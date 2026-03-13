const { norm } = require("../utils/text");

function normalizeGenderValue(value) {
  const g = norm(String(value || ""));

  if (!g) return "unknown";

  if (
    g.includes("жіноч") ||
    g.includes("женск") ||
    g.includes("female") ||
    g.includes("women") ||
    g.includes("woman") ||
    g.includes("for women")
  ) {
    return "female";
  }

  if (
    g.includes("чолов") ||
    g.includes("мужск") ||
    g.includes("male") ||
    g.includes("men") ||
    g.includes("man") ||
    g.includes("for men")
  ) {
    return "male";
  }

  if (
    g.includes("унісекс") ||
    g.includes("унисекс") ||
    g.includes("unisex") ||
    g.includes("для всіх") ||
    g.includes("для всех")
  ) {
    return "unisex";
  }

  return "unknown";
}

function getGenderPriority(requestedGender, itemGender) {
  const req = normalizeGenderValue(requestedGender);
  const item = normalizeGenderValue(itemGender);

  // Якщо користувач хоче жіночий:
  // 1) female
  // 2) unisex
  // 3) unknown
  // 4) male
  if (req === "female") {
    if (item === "female") return 0;
    if (item === "unisex") return 1;
    if (item === "unknown") return 2;
    if (item === "male") return 3;
  }

  // Якщо користувач хоче чоловічий:
  // 1) male
  // 2) unisex
  // 3) unknown
  // 4) female
  if (req === "male") {
    if (item === "male") return 0;
    if (item === "unisex") return 1;
    if (item === "unknown") return 2;
    if (item === "female") return 3;
  }

  // Якщо запит unisex або gender не визначений —
  // лишаємо майже початковий порядок, але unisex трохи вище
  if (req === "unisex") {
    if (item === "unisex") return 0;
    if (item === "unknown") return 1;
    return 2;
  }

  return 0;
}

function rerankTopK(
  candidates,
  profile,
  targetName = "",
  topK = 3,
  offset = 0
) {
  const seen = new Set();
  const filtered = [];

  const baseName = norm(targetName || "");
  const requestedGender = profile?.gender || "unknown";

  for (const item of candidates || []) {
    const key = norm(`${item.number_code || ""}|${item.name || ""}`);
    if (!key) continue;
    if (seen.has(key)) continue;

    const itemName = norm(item.name || "");
    if (baseName && itemName && itemName === baseName) {
      continue;
    }

    seen.add(key);

    filtered.push({
      ...item,
      _gender_priority: getGenderPriority(requestedGender, item.gender),
    });
  }

  // Спочатку сортуємо по пріоритету статі,
  // потім по match_score, якщо він є
  filtered.sort((a, b) => {
    if (a._gender_priority !== b._gender_priority) {
      return a._gender_priority - b._gender_priority;
    }

    const aScore = Number(a.match_score || 0);
    const bScore = Number(b.match_score || 0);

    return bScore - aScore;
  });

  return filtered
    .slice(offset, offset + topK)
    .map(({ _gender_priority, ...item }) => item);
}

module.exports = { rerankTopK };