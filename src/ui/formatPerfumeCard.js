const { truncate } = require("../utils/text");

function genderToUa(gender) {
  const g = String(gender || "").toLowerCase();

  if (
    g.includes("male") ||
    g.includes("man") ||
    g.includes("men") ||
    g.includes("чолов") ||
    g.includes("муж")
  ) {
    return "Чоловічий";
  }

  if (
    g.includes("female") ||
    g.includes("woman") ||
    g.includes("women") ||
    g.includes("жіноч") ||
    g.includes("жен")
  ) {
    return "Жіночий";
  }

  if (g.includes("unisex") || g.includes("унісекс") || g.includes("унисекс")) {
    return "Унісекс";
  }

  return gender || "Невідомо";
}

function buildPerfumeCaption(item, options = {}) {
  const name = item.name || "Без назви";

  const code = item.number_code ? `Код: ${item.number_code}\n` : "";
  const type = item.category ? `Тип: ${item.category}\n` : "";
  const gender = `Для кого: ${genderToUa(item.gender)}\n`;

  const season =
    options.season && item.season ? `Сезон: ${item.season}\n` : "";

  const notes =
    options.notes && item.notes ? `Ноти: ${truncate(item.notes, 260)}\n` : "";

  const accords = item.accords
    ? `Напрям: ${truncate(item.accords, 180)}\n`
    : "";

  const desc = item.short_desc
    ? `\n${truncate(item.short_desc, 650)}`
    : item.description
      ? `\n${truncate(item.description, 650)}`
      : "";

  return `**${name}**\n\n${code}${type}${gender}${season}${notes}${accords}${desc}`.trim();
}

module.exports = { buildPerfumeCaption };