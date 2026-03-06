const { buildPerfumeCaption } = require("../ui/formatPerfumeCard");

async function sendPerfumeCard(ctx, item, options = {}) {
  const caption = buildPerfumeCaption(item, options);
  const photo = item.image_url || null;

  if (photo) {
    try {
      return await ctx.replyWithPhoto(
        { url: photo },
        {
          caption,
          parse_mode: "Markdown",
        },
      );
    } catch (e) {
      console.error("replyWithPhoto failed:", e?.message || e);
    }
  }

  return ctx.reply(caption, { parse_mode: "Markdown" });
}

module.exports = { sendPerfumeCard };