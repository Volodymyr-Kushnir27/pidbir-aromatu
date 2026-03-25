const { buildPerfumeCaption } = require("../ui/formatPerfumeCard");
const { perfumeCardKeyboard } = require("../ui/keyboards");

const SAFE_CAPTION_LIMIT = 900;

function cleanText(text) {
  return String(text || "").replace(/\r/g, "").replace(/\u0000/g, "").trim();
}

function trimText(text, max) {
  const clean = cleanText(text);
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function buildShortCaption(item, options = {}) {
  const name = String(item?.name || "Без назви").trim();
  const code = String(item?.number_code || "—").trim();
  const type = String(item?.type || item?.category || "—").trim();
  const gender = String(item?.for_whom || item?.gender || "—").trim();
  const season = options?.season ? String(item?.season || "").trim() : "";

  const notesRaw = String(item?.notes || "").trim();
  const notes = notesRaw
    ? notesRaw
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 5)
        .join(", ")
    : "";

  const lines = [
    `**${name}**`,
    `🔢 Код: ${code}`,
    `🧴 Тип: ${type}`,
    `👤 Для кого: ${gender}`,
  ];

  if (season) {
    lines.push(`🍂 Сезон: ${season}`);
  }

  if (notes) {
    lines.push(`🌿 Ноти: ${notes}`);
  }

  return trimText(lines.join("\n"), SAFE_CAPTION_LIMIT);
}

async function replyWithPhotoSafe(ctx, photo, caption, keyboard) {
  try {
    return await ctx.replyWithPhoto(
      { url: photo },
      {
        caption,
        reply_markup: keyboard?.reply_markup,
      },
    );
  } catch (e1) {
    console.error("replyWithPhoto(url) failed:", e1?.message || e1);

    try {
      return await ctx.replyWithPhoto(photo, {
        caption,
        reply_markup: keyboard?.reply_markup,
      });
    } catch (e2) {
      console.error("replyWithPhoto(raw) failed:", e2?.message || e2);
      return null;
    }
  }
}

async function sendPerfumeCard(ctx, item, options = {}) {
  const fullCaption = cleanText(buildPerfumeCaption(item, options));
  const shortCaption = buildShortCaption(item, options);
  const keyboard = perfumeCardKeyboard(item);
  const photo = item?.image_url || item?.photo || null;

  console.log("CARD DEBUG", {
    id: item?.id,
    name: item?.name,
    hasPhoto: Boolean(photo),
    fullCaptionLength: fullCaption.length,
    shortCaptionLength: shortCaption.length,
  });

  if (photo) {
    const photoMsg = await replyWithPhotoSafe(ctx, photo, shortCaption, keyboard);
    if (photoMsg) return photoMsg;
  }

  return ctx.reply(fullCaption || shortCaption || "🧴 Аромат знайдено.", {
    reply_markup: keyboard?.reply_markup,
  });
}

module.exports = { sendPerfumeCard };