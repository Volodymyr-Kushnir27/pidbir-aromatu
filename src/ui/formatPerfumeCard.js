function truncate(s, n) {
  s = String(s || "").trim();
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function genderEmoji(forWhom) {
  const x = String(forWhom || "").toLowerCase();
  if (x.includes("чолов")) return "👨 Чоловічий";
  if (x.includes("жін")) return "👩 Жіночий";
  if (x.includes("унісекс")) return "🧑‍🤝‍🧑 Унісекс";
  return "🧑 Для всіх";
}

function safeLine(label, value) {
  const v = String(value || "").trim();
  return v ? `${label}: ${v}` : "";
}

function buildPerfumeCaption(p, toggles = {}) {
  // Основний текст картки (як на скріні)
  const header = `${p.number_code ? p.number_code + " " : ""}${p.brand ? p.brand + " " : ""}"${p.name}" (версія аромату)`;
  const g = genderEmoji(p.for_whom);

  const type = safeLine("Тип", p.type);
  const occasion = safeLine("Для події", p.occasion);
  const age = safeLine("Вік", p.age);

  const desc = p.description ? `Опис: ${truncate(p.description, 360)}` : "";

  // Toggle секції
  const notes = toggles.notes
    ? `\n\nНоти:\n${truncate(p.notes || p.notes_text || "", 420)}`
    : "";

  const season = toggles.season
    ? `\n\nСезон:\n${truncate(p.season || "", 220)}`
    : "";

  // Склейка + контроль довжини
  const parts = [
    header,
    g,
    "",
    type,
    occasion,
    age,
    "",
    desc,
    notes,
    season,
  ].filter(Boolean);

  let caption = parts.join("\n");

  // safety: Telegram caption limit ~1024
  if (caption.length > 980) caption = caption.slice(0, 979) + "…";

  return caption;
}

module.exports = { buildPerfumeCaption };
