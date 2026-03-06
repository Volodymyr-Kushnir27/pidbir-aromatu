function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean).map((x) => String(x).trim()))];
}

function compact(arr = []) {
  return arr.filter(Boolean).map((x) => String(x).trim());
}

function includesAny(text, arr = []) {
  const t = norm(text);
  return arr.some((x) => t.includes(norm(x)));
}

function pickText(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter(Boolean)
    .join(" ");
}

function truncate(text, max = 300) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

module.exports = {
  norm,
  uniq,
  compact,
  includesAny,
  pickText,
  truncate,
};