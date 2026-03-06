const { buildPerfumeCaption } = require("../ui/formatPerfumeCard");
const { perfumeCardKeyboard } = require("../ui/keyboards");

async function sendPerfumeCard(ctx, item, options = {}) {
  const caption = buildPerfumeCaption(item, options);
  const photo = item.image_url || item.photo || null;
  const keyboard = perfumeCardKeyboard(item);

  if (photo) {
    try {
      return await ctx.replyWithPhoto(
        { url: photo },
        {
          caption,
          parse_mode: "Markdown",
          reply_markup: keyboard?.reply_markup,
        },
      );
    } catch (e) {
      console.error("replyWithPhoto failed:", e?.message || e);
    }
  }

  return ctx.reply(caption, {
    parse_mode: "Markdown",
    reply_markup: keyboard?.reply_markup,
  });
}

module.exports = { sendPerfumeCard };