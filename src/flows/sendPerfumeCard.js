// src/flows/sendPerfumeCard.js
const { buildPerfumeCaption } = require("../ui/formatPerfumeCard");
const { perfumeCardKeyboard } = require("../ui/keyboards");

async function sendPerfumeCard(ctx, perfume, toggles = { notes: false, season: false, reasonText: "" }) {
  const reason = String(toggles?.reasonText || "").trim();
  const baseCaption = buildPerfumeCaption(perfume, toggles);
  const caption = reason ? `🧠 ${reason}\n\n${baseCaption}` : baseCaption;

  // ✅ передаємо toggles у клавіатуру, щоб кнопки змінювалися (і markup теж)
  const keyboard = perfumeCardKeyboard(perfume.id, {
    notes: !!toggles?.notes,
    season: !!toggles?.season,
  });

  if (!perfume.photo) {
    return ctx.reply(caption, keyboard);
  }

  return ctx.replyWithPhoto({ url: perfume.photo }, { caption, ...keyboard });
}

module.exports = { sendPerfumeCard };