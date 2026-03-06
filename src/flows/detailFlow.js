const { getPerfumeById } = require("../search/catalogRepo");
const { chatJSON } = require("../llm/client");

async function writePerfumeDetails(item) {
  const system = `
Ти досвідчений парфумерний консультант.

На основі даних аромату напиши красивий, природний, читабельний текст українською для Telegram.

Поверни JSON:
{
  "text": ""
}

Вимоги:
- Пиши як живий консультант.
- Не сухо.
- Використовуй блоки й емодзі.
- Має бути:
  1. що це за аромат
  2. характер
  3. ноти / напрям
  4. для кого
  5. сезон / коли носити
  6. короткий висновок
- Не вигадуй того, чого немає в даних.
`;

  const user = JSON.stringify(
    {
      name: item.name,
      code: item.number_code,
      gender: item.gender,
      category: item.category,
      season: item.season,
      occasion: item.occasion,
      age: item.age,
      notes: item.notes,
      accords: item.accords,
      description: item.description,
      short_desc: item.short_desc,
      keywords: item.keywords,
      version: item.version,
    },
    null,
    2,
  );

  const json = await chatJSON({
    system,
    user,
    temperature: 0.45,
  });

  return String(json?.text || "").trim();
}

async function onDetailAction(ctx, perfumeId) {
  const item = getPerfumeById(Number(perfumeId));

  if (!item) {
    await ctx.reply("❌ Не знайшов аромат.");
    return;
  }

  await ctx.reply("🧠 Готую детальний розбір аромату...");

  try {
    const text = await writePerfumeDetails(item);

    if (text) {
      await ctx.reply(text);
      return;
    }
  } catch (e) {
    console.error("onDetailAction error:", e);
  }

  await ctx.reply(
    `🧴 **${item.name}**\n\n` +
      `🔢 Код: ${item.number_code || "—"}\n` +
      `👤 Для кого: ${item.gender || "—"}\n` +
      `🧴 Тип: ${item.category || "—"}\n` +
      `🍂 Сезон: ${item.season || "—"}\n` +
      `🌿 Ноти: ${item.notes || "—"}\n` +
      `✨ Напрям: ${item.accords || item.keywords || "—"}\n\n` +
      `${item.description || item.short_desc || ""}`,
    { parse_mode: "Markdown" },
  );
}

module.exports = { onDetailAction };