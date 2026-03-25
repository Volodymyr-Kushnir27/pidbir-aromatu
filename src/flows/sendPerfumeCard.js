const { buildPerfumeCaption } = require("../ui/formatPerfumeCard");
const { perfumeCardKeyboard } = require("../ui/keyboards");

const TELEGRAM_CAPTION_LIMIT = 1024;
const SAFE_CAPTION_LIMIT = 1000;
const EXTRA_TEXT_LIMIT = 3500;

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function trimText(text, max) {
  const clean = cleanText(text);
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function splitLongText(text, limit = EXTRA_TEXT_LIMIT) {
  const clean = cleanText(text);
  if (!clean) return [];

  if (clean.length <= limit) return [clean];

  const parts = [];
  let rest = clean;

  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < 500) cut = rest.lastIndexOf(". ", limit);
    if (cut < 300) cut = rest.lastIndexOf(" ", limit);
    if (cut < 1) cut = limit;

    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

function buildCompactCaption(item, options = {}) {
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
        .slice(0, 6)
        .join(", ")
    : "";

  const desc = cleanText(item?.short_desc || "");

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

  if (desc) {
    lines.push("");
    lines.push(trimText(desc, 420));
  }

  return trimText(lines.join("\n"), SAFE_CAPTION_LIMIT);
}

async function tryReplyWithPhoto(ctx, photo, caption, keyboard) {
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
  const keyboard = perfumeCardKeyboard(item);
  const photo = item?.image_url || item?.photo || null;

  const fullCaption = cleanText(buildPerfumeCaption(item, options));
  const compactCaption = buildCompactCaption(item, options);

  console.log("CARD DEBUG", {
    id: item?.id,
    name: item?.name,
    hasPhoto: Boolean(photo),
    fullCaptionLength: fullCaption.length,
    compactCaptionLength: compactCaption.length,
  });

  if (photo) {
    const captionForPhoto =
      fullCaption.length <= TELEGRAM_CAPTION_LIMIT
        ? fullCaption
        : compactCaption;

    const photoMsg = await tryReplyWithPhoto(ctx, photo, captionForPhoto, keyboard);

    if (photoMsg) {
      if (fullCaption.length > TELEGRAM_CAPTION_LIMIT) {
        const extraText = cleanText(fullCaption.slice(captionForPhoto.length));
        const extraParts = splitLongText(extraText);

        for (const part of extraParts) {
          await ctx.reply(part);
        }
      }

      return photoMsg;
    }
  }

  const textParts = splitLongText(fullCaption || compactCaption || "🧴 Аромат знайдено.");
  const first = await ctx.reply(textParts[0], {
    reply_markup: keyboard?.reply_markup,
  });

  for (const part of textParts.slice(1)) {
    await ctx.reply(part);
  }

  return first;
}

module.exports = { sendPerfumeCard };