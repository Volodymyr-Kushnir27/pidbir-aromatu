const { buildPerfumeCaption } = require("../ui/formatPerfumeCard");
const { perfumeCardKeyboard } = require("../ui/keyboards");

const TELEGRAM_CAPTION_LIMIT = 1024;
const SAFE_CAPTION_LIMIT = 950;

function normalizeText(s) {
  return String(s || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function splitLongText(text, limit = 3500) {
  const clean = normalizeText(text);
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

function buildShortCaption(item, options = {}) {
  const name = String(item?.name || "Без назви").trim();
  const code = String(item?.number_code || "—").trim();
  const gender = String(item?.gender || item?.for_whom || "—").trim();
  const category = String(item?.category || item?.type || "—").trim();

  const notesRaw = String(item?.notes || "").trim();
  const shortNotes = notesRaw
    ? notesRaw
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 5)
        .join(", ")
    : "";

  const season = options?.season ? String(item?.season || "").trim() : "";

  const lines = [
    `**${name}**`,
    `🔢 Код: ${code}`,
    `🧴 Тип: ${category}`,
    `👤 Для кого: ${gender}`,
  ];

  if (season) {
    lines.push(`🍂 Сезон: ${season}`);
  }

  if (shortNotes) {
    lines.push(`🌿 Ноти: ${shortNotes}`);
  }

  return normalizeText(lines.join("\n")).slice(0, SAFE_CAPTION_LIMIT);
}

function trimCaption(text, max = SAFE_CAPTION_LIMIT) {
  const clean = normalizeText(text);
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
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
  const fullCaption = normalizeText(buildPerfumeCaption(item, options));
  const shortCaptionBase = buildShortCaption(item, options);
  const shortCaption = trimCaption(
    shortCaptionBase || fullCaption,
    SAFE_CAPTION_LIMIT,
  );

  const photo = item.image_url || item.photo || null;
  const keyboard = perfumeCardKeyboard(item);

  const fullParts = splitLongText(fullCaption, 3500);
  const needSeparateText =
    fullCaption.length > TELEGRAM_CAPTION_LIMIT ||
    fullCaption !== shortCaption;

  if (photo) {
    const photoMsg = await tryReplyWithPhoto(ctx, photo, shortCaption, keyboard);

    if (photoMsg) {
      if (needSeparateText) {
        for (const part of fullParts) {
          await ctx.reply(part);
        }
      }
      return photoMsg;
    }
  }

  if (!fullParts.length) {
    return ctx.reply("🧴 Аромат знайдено.", {
      reply_markup: keyboard?.reply_markup,
    });
  }

  const first = await ctx.reply(fullParts[0], {
    reply_markup: keyboard?.reply_markup,
  });

  if (fullParts.length > 1) {
    for (const part of fullParts.slice(1)) {
      await ctx.reply(part);
    }
  }

  return first;
}
console.log("CARD DEBUG", {
  id: item?.id,
  name: item?.name,
  hasPhoto: Boolean(photo),
  photo: photo || null,
  fullCaptionLength: fullCaption.length,
  shortCaptionLength: shortCaption.length,
});

module.exports = { sendPerfumeCard };