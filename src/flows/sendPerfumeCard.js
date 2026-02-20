const { buildPerfumeCaption } = require("../ui/formatPerfumeCard");
const { perfumeCardKeyboard } = require("../ui/keyboards");

async function sendPerfumeCard(ctx, perfume, toggles = { notes:false, season:false }) {
  const caption = buildPerfumeCaption(perfume, toggles);
  const keyboard = perfumeCardKeyboard(perfume.id);

  // fallback якщо картинки немає
if (!perfume.photo) {
  return ctx.reply(caption, keyboard);
}

return ctx.replyWithPhoto(
  { url: perfume.photo },
  { caption, ...keyboard }
);

}

module.exports = { sendPerfumeCard };
