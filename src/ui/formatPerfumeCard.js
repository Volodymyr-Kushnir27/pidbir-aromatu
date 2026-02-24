// src/ui/formatPerfumeCard.js
function norm(s) {
  return String(s || "").trim();
}

function buildPerfumeCaption(perfume, toggles = { notes: false, season: false, reasonText: "" }) {
  const p = perfume || {};

  const name = norm(p.name);
  const forWhom = norm(p.for_whom);
  const type = norm(p.type);
  const season = norm(p.season);
  const desc = norm(p.description);
  const notes = norm(p.notes);

  const lines = [];

  if (name) lines.push(name);

  if (forWhom) {
    const fw = forWhom.toLowerCase();
    const icon = fw.includes("жін") ? "👩" : fw.includes("чолов") ? "👨" : "🧑";
    lines.push(`${icon} ${forWhom}`);
  }

  if (type) lines.push(`Тип: ${type}`);

  // БАЗОВО сезон не показуємо, тільки по toggle
  if (toggles?.season) {
    lines.push(`🌤 Сезон: ${season || "— (немає в базі)"}`);
  }

  if (desc) lines.push(`Опис: ${desc}`);

  // Ноти — тільки по toggle
  if (toggles?.notes) {
    lines.push("");
    lines.push(`✨ Ноти: ${notes || "— (немає в базі)"}`);
  }

  return lines.filter(Boolean).join("\n");
}

module.exports = { buildPerfumeCaption };