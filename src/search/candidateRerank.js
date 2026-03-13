const { norm } = require("../utils/text");

function normalizeGenderValue(value) {
  const g = norm(String(value || ""));

  if (!g) return "unknown";

  if (
    g.includes("жіноч") ||
    g.includes("женск") ||
    g.includes("female") ||
    g.includes("women") ||
    g.includes("woman")
  ) return "female";

  if (
    g.includes("чолов") ||
    g.includes("мужск") ||
    g.includes("male") ||
    g.includes("men") ||
    g.includes("man")
  ) return "male";

  if (
    g.includes("унісекс") ||
    g.includes("унисекс") ||
    g.includes("unisex")
  ) return "unisex";

  return "unknown";
}

function getGenderBucket(requestedGender, itemGender) {
  const req = normalizeGenderValue(requestedGender);
  const item = normalizeGenderValue(itemGender);

  if (req === "female") {
    if (item === "female") return 0;
    if (item === "unisex") return 1;
    return 2;
  }

  if (req === "male") {
    if (item === "male") return 0;
    if (item === "unisex") return 1;
    return 2;
  }

  return 0;
}

function rerankTopK(candidates, profile, targetName = "", topK = 3, offset = 0) {
  const seen = new Set();
  const filtered = [];
  const baseName = norm(targetName || "");

  for (const item of candidates || []) {
    const key = norm(`${item.number_code || ""}|${item.name || ""}`);
    if (!key || seen.has(key)) continue;

    const itemName = norm(item.name || "");
    if (baseName && itemName === baseName) continue;

    seen.add(key);

    filtered.push({
      ...item,
      _gender_bucket: getGenderBucket(profile?.gender, item.gender),
    });
  }

  filtered.sort((a, b) => {
    if (a._gender_bucket !== b._gender_bucket) {
      return a._gender_bucket - b._gender_bucket;
    }
    return Number(b.match_score || 0) - Number(a.match_score || 0);
  });

  return filtered
    .slice(offset, offset + topK)
    .map(({ _gender_bucket, ...item }) => item);
}

module.exports = { rerankTopK };

function getGenderBucket(requestedGender, itemGender) {
  const req = normalizeGenderValue(requestedGender);
  const item = normalizeGenderValue(itemGender);

  if (req === "female") {
    if (item === "female") return 0;
    if (item === "unisex") return 1;
    return 2;
  }

  if (req === "male") {
    if (item === "male") return 0;
    if (item === "unisex") return 1;
    return 2;
  }

  if (req === "unisex") {
    if (item === "unisex") return 0;
    return 1;
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
    if (baseName && itemName && itemName === baseName) continue;

    seen.add(key);

    filtered.push({
      ...item,
      _gender_bucket: getGenderBucket(requestedGender, item.gender),
    });
  }

  filtered.sort((a, b) => {
    if (a._gender_bucket !== b._gender_bucket) {
      return a._gender_bucket - b._gender_bucket;
    }

    const aScore = Number(a.match_score || 0);
    const bScore = Number(b.match_score || 0);
    return bScore - aScore;
  });

  function normalizeGenderValue(value) {
  const g = norm(String(value || ""));

  if (!g) return "unknown";

  if (
    g.includes("жіноч") ||
    g.includes("женск") ||
    g.includes("female") ||
    g.includes("women") ||
    g.includes("woman")
  ) return "female";

  if (
    g.includes("чолов") ||
    g.includes("мужск") ||
    g.includes("male") ||
    g.includes("men") ||
    g.includes("man")
  ) return "male";

  if (
    g.includes("унісекс") ||
    g.includes("унисекс") ||
    g.includes("unisex")
  ) return "unisex";

  return "unknown";
}

function findCandidates(searchProfile, limit = 50) {
  const rows = getAllPerfumes();

  let filteredRows = rows;

  const reqGender = normalizeGenderValue(searchProfile?.gender);

  if (reqGender === "female") {
    filteredRows = rows.filter((row) => {
      const g = normalizeGenderValue(row.gender);
      return g === "female" || g === "unisex";
    });
  }

  if (reqGender === "male") {
    filteredRows = rows.filter((row) => {
      const g = normalizeGenderValue(row.gender);
      return g === "male" || g === "unisex";
    });
  }

  const scored = filteredRows
    .map((row) => {
      const baseScore = scoreCandidate(row, searchProfile);
      const expanded = applyOntologyScore(row, searchProfile);
      const total = baseScore + expanded.score;

      return {
        ...row,
        match_score: total,
        _debug: buildMatchDebug(row, expanded),
      };
    })
    .filter((row) => row.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);

  return scored;
}

  return filtered
    .slice(offset, offset + topK)
    .map(({ _gender_bucket, ...item }) => item);
}

module.exports = { rerankTopK };