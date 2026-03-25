const { chatJSON } = require("./client");

function uniq(arr = []) {
  return [...new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function buildFallbackIntro(analysis) {
  const target = String(analysis?.target_name || analysis?.brand || "цей аромат").trim();
  const brand = String(analysis?.brand || "").trim();

  const notesTop = uniq(analysis?.notes_top || []).slice(0, 4);
  const notesHeart = uniq(analysis?.notes_heart || []).slice(0, 4);
  const notesBase = uniq(analysis?.notes_base || []).slice(0, 4);
  const accords = uniq([...(analysis?.accords || []), ...(analysis?.style || [])]).slice(0, 6);
  const seasons = uniq(analysis?.seasons || []).slice(0, 4);

  const title =
    brand && target && !target.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${target}`
      : target;

  const lines = [];
  lines.push(`🧴 Орієнтир: ${title}.`);

  if (accords.length) {
    lines.push(`✨ За характером він читається як: ${accords.join(", ")}.`);
  }

  const noteLines = [];
  if (notesTop.length) noteLines.push(`• верхні: ${notesTop.join(", ")}`);
  if (notesHeart.length) noteLines.push(`• серце: ${notesHeart.join(", ")}`);
  if (notesBase.length) noteLines.push(`• база: ${notesBase.join(", ")}`);

  if (noteLines.length) {
    lines.push(`\n🌿 Основні ноти:\n${noteLines.join("\n")}`);
  }

  if (seasons.length) {
    lines.push(`\n🍂 Найкраще звучить у сезони: ${seasons.join(", ")}.`);
  }

  lines.push(`\nЗараз підберу схожі варіанти з бази за нотами, характером і загальним напрямом.`);
  return lines.join("\n");
}

async function writeReferencePerfumeIntro({ userText, analysis }) {
  const system = `
Ти сильний парфумерний консультант.

Твоє завдання:
на основі розпізнаного зовнішнього аромату написати хороший вступний текст українською для Telegram-бота.

Поверни JSON:
{
  "intro_text": ""
}

Вимоги до intro_text:
- Готовий текст для користувача.
- Природний стиль, як у хорошого ChatGPT-консультанта.
- Без канцеляриту.
- Можна використовувати небагато емодзі: 🧴 🌿 ✨ 👤 🍂
- Має бути компактно, але змістовно.
- Якщо є дані, обов'язково включи:
  1. що це за аромат / який у нього напрям
  2. характер звучання
  3. ноти:
     - верхні
     - серце
     - база
  4. для кого або який вайб
  5. коли найкраще звучить
  6. короткий підсумок
- Якщо частини даних бракує, не бреши і не вигадуй зайве.
- Не пиши "я не знаю", "можливо", "ймовірно" занадто часто.
- Не додавай в текст JSON.
- Не пиши занадто довго.
- Фінал має м’яко підвести до того, що зараз будуть схожі варіанти з бази.
`;

  const user = JSON.stringify(
    {
      userText,
      analysis: {
        query_type: analysis?.query_type,
        target_name: analysis?.target_name,
        brand: analysis?.brand,
        gender: analysis?.gender,
        seasons: analysis?.seasons,
        style: analysis?.style,
        notes_top: analysis?.notes_top,
        notes_heart: analysis?.notes_heart,
        notes_base: analysis?.notes_base,
        accords: analysis?.accords,
        intent_context: analysis?.intent_context,
      },
    },
    null,
    2,
  );

  const json = await chatJSON({
    system,
    user,
    temperature: 0.45,
  });

  const intro = String(json?.intro_text || "").trim();
  if (intro) return intro;

  return buildFallbackIntro(analysis);
}

module.exports = { writeReferencePerfumeIntro };