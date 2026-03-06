const { norm } = require("../utils/text");

function rerankTopK(candidates, profile, targetName = "", topK = 3) {
  const seen = new Set();
  const filtered = [];

  for (const item of candidates || []) {
    const key = norm(`${item.brand || ""} ${item.name || ""}`);
    if (!key) continue;
    if (seen.has(key)) continue;
    if (targetName && norm(item.name) === norm(targetName)) continue;

    seen.add(key);
    filtered.push(item);

    if (filtered.length >= topK) break;
  }

  return filtered;
}

module.exports = { rerankTopK };