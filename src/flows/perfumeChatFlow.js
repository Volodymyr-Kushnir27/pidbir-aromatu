// src/flows/perfumeChatFlow.js
const { findPerfumeByCodeOrDigits } = require("../search/catalogRepo");
const { retrieveCandidatesEmbeddings } = require("../search/retrieveCandidatesEmbeddings");
const { sendPerfumeCard } = require("./sendPerfumeCard");

// pick-mode state: tgId -> true/false
const pickMode = new Map();

function isPickMode(ctx) {
  const tgId = ctx.from?.id;
  return !!(tgId && pickMode.get(tgId));
}

function disablePickMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) pickMode.delete(tgId);
}

async function onUserPickAction(ctx) {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  pickMode.set(tgId, true); // ✅ тільки вмикаємо, без повідомлень/кнопок
}

// ✅ локальна витяжка коду: 77A/77А або 77
function extractCodeLocal(text) {
  const t = String(text || "").toUpperCase();

  // 77A / 77А
  let m = t.match(/\b(\d{1,3}\s*[A-ZА-Я])\b/u);
  if (m) return m[1].replace(/\s+/g, "");

  // 77
  m = t.match(/\b(\d{1,3})\b/u);
  if (m) return m[1];

  return null;
}

async function onUserText(ctx) {
  if (!isPickMode(ctx)) return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  // 1) Пошук по коду/номеру
  const code = extractCodeLocal(text);
  if (code) {
    const perfume = findPerfumeByCodeOrDigits(code);

    if (!perfume) {
      await ctx.reply(`❌ Не знайшов у базі код: ${code}`);
      return true;
    }

    await sendPerfumeCard(ctx, perfume, { notes: false, season: false });
    return true;
  }

  // 2) Підбір по опису (embeddings)
  try {
    const items = await retrieveCandidatesEmbeddings({
      queryText: text,
      limit: 5,
      filters: {},
    });

    if (!items || !items.length) {
      await ctx.reply("❌ Нічого схожого не знайшов. Спробуй інший опис або введи код (77A).");
      return true;
    }

    await ctx.reply("✨ Ось що підійшло з бази:");
    for (const p of items) {
      await sendPerfumeCard(ctx, p, { notes: false, season: false });
    }
    return true;
  } catch (e) {
    console.error("retrieveCandidatesEmbeddings error:", e?.message);
    await ctx.reply(
      "⚠️ Підбір по опису тимчасово недоступний (embeddings).\n" +
      "Введи код (77A) або попроси адміна прогнати індексацію embeddings."
    );
    return true;
  }
}

module.exports = {
  onUserPickAction,
  onUserText,
  disablePickMode,
};