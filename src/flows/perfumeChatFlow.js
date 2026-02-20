// src/flows/perfumeChatFlow.js
const { searchPerfumesSmart, extractNumberCode, findPerfumesByCodeOrDigits } = require("../search/catalogRepo");
const { sendPerfumeCard } = require("./sendPerfumeCard");

// Прапор режиму підбору для кожного tgId
const pickMode = new Map(); // tgId -> true/false

function isPickMode(ctx) {
  const tgId = ctx.from?.id;
  return !!(tgId && pickMode.get(tgId));
}

function enablePickMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) pickMode.set(tgId, true);
}

function disablePickMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) pickMode.delete(tgId);
}

// Викликається з кнопки/меню або автоматично при вході продавця
async function onUserPickAction(ctx, { silent = false } = {}) {
  enablePickMode(ctx);

  if (!silent) {
    await ctx.reply(
      "✅ Режим підбору активний.\n" +
      "Можеш ввести:\n" +
      "- код парфуму: 77A або 60Е\n" +
      "- або запит словами: солодкий цитрус на літо\n"
    );
  }
}

async function onUserText(ctx) {
  if (!isPickMode(ctx)) return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  // 1) Якщо користувач вводить КОД/НОМЕР — віддаємо ВСІ збіги
  const code = extractNumberCode(text);
  if (code) {
    const items = findPerfumesByCodeOrDigits(code, { limit: 10 });
    if (!items.length) {
      await ctx.reply(`❌ Не знайшов у базі код/номер: ${code}`);
      return true;
    }

    // Якщо один — одразу картка
    if (items.length === 1) {
      await sendPerfumeCard(ctx, items[0], { notes: false, season: false });
      return true;
    }

   await ctx.reply(`🔎 Знайшов ${items.length} варіант(и) по "${code}". Показую до 3:`);

for (let i = 0; i < Math.min(3, items.length); i++) {
  await sendPerfumeCard(ctx, items[i], { notes: false, season: false });
}

return true;
  }

  // 2) Інакше — “розумний” пошук по БД (LLM тільки парсить, НЕ вигадує)
  const res = await searchPerfumesSmart(text, { limit: 5 });

  if (!res.items || !res.items.length) {
    await ctx.reply(
      "❌ Нічого точного не знайшов у базі.\n" +
      "Спробуй уточнити: стать/сезон/тип/ноти.\n" +
      "Наприклад: 'чоловічий, зима, алкогольні ноти' або 'унісекс цитрус на літо'."
    );
    return true;
  }

  // Показуємо результати
  for (const p of res.items) {
    await sendPerfumeCard(ctx, p, { notes: false, season: false });
  }

  return true;
}

module.exports = {
  onUserPickAction,
  onUserText,
  enablePickMode,
  disablePickMode,
  isPickMode,
};