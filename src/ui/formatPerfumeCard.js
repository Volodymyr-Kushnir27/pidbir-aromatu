const { truncate } = require("../utils/text");

function buildPerfumeCaption(item, options = {}) {
  const name = item.name || "Без назви";
  const brand = item.brand ? `Бренд: ${item.brand}\n` : "";
  const type = item.category ? `Тип: ${item.category}\n` : "";
  const gender = item.gender ? `Для кого: ${item.gender}\n` : "";
  const season = options.season && item.season ? `Сезон: ${item.season}\n` : "";
  const notes = options.notes && item.notes ? `Ноти: ${truncate(item.notes, 240)}\n` : "";
  const accords = item.accords ? `Напрям: ${truncate(item.accords, 160)}\n` : "";
  const desc = item.short_desc
    ? `\n${truncate(item.short_desc, 500)}`
    : item.description
      ? `\n${truncate(item.description, 500)}`
      : "";

  return `**${name}**\n\n${brand}${type}${gender}${season}${notes}${accords}${desc}`.trim();
}

module.exports = { buildPerfumeCaption };