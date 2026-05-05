const { chatJSON } = require("./client");

function uniq(arr = []) {
  return [
    ...new Set(
      (arr || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
}

function pickData(analysis, webPerfumeData) {
  const web = webPerfumeData || {};

  return {
    brand: web.brand || analysis?.brand || "",
    target_name:
      web.target_name ||
      web.normalized_name ||
      analysis?.target_name ||
      analysis?.normalized_query ||
      "цей аромат",

    description: web.description || web.short_summary || "",
    gender: web.gender || analysis?.gender || "unknown",
    seasons: uniq([...(web.seasons || []), ...(analysis?.seasons || [])]),
    style: uniq([...(web.style || []), ...(analysis?.style || [])]),
    notes_top: uniq([...(web.notes_top || []), ...(analysis?.notes_top || [])]),
    notes_heart: uniq([...(web.notes_heart || []), ...(analysis?.notes_heart || [])]),
    notes_base: uniq([...(web.notes_base || []), ...(analysis?.notes_base || [])]),
    accords: uniq([...(web.accords || []), ...(analysis?.accords || [])]),
    source_urls: uniq(web.source_urls || []),
  };
}

function buildFallbackIntro(analysis, webPerfumeData) {
  const data = pickData(analysis, webPerfumeData);

  const title =
    data.brand &&
    data.target_name &&
    !data.target_name.toLowerCase().includes(data.brand.toLowerCase())
      ? `${data.brand} ${data.target_name}`
      : data.target_name;

  const notesTop = data.notes_top.slice(0, 5);
  const notesHeart = data.notes_heart.slice(0, 5);
  const notesBase = data.notes_base.slice(0, 5);
  const accords = uniq([...data.accords, ...data.style]).slice(0, 7);

  const lines = [];

  lines.push(`Привіт! ✨ Сьогодні говоримо про аромат "${title}".`);

  if (data.description) {
    lines.push(`\n${data.description}`);
  } else if (accords.length) {
    lines.push(`\nЦе аромат у напрямі: ${accords.join(", ")}.`);
  }

  const noteLines = [];
  if (notesTop.length) noteLines.push(`• верхні ноти: ${notesTop.join(", ")}`);
  if (notesHeart.length) noteLines.push(`• серце: ${notesHeart.join(", ")}`);
  if (notesBase.length) noteLines.push(`• база: ${notesBase.join(", ")}`);

  if (noteLines.length) {
    lines.push(`\n🌿 Основні ноти:\n${noteLines.join("\n")}`);
  }

  if (data.seasons.length) {
    lines.push(`\n🍂 Найкраще звучить у сезони: ${data.seasons.slice(0, 4).join(", ")}.`);
  }

  lines.push(
    `\nЗараз підберу з бази найближчі варіанти за нотами, характером і загальним напрямом.`,
  );

  return lines.join("\n");
}

async function writeReferencePerfumeIntro({ userText, analysis, webPerfumeData }) {
  const data = pickData(analysis, webPerfumeData);

  const system = `
Ти сильний парфумерний консультант для Telegram-бота.

Твоє завдання:
написати хороший вступний текст українською про зовнішній аромат-орієнтир.

КРИТИЧНО:
- НІКОЛИ не пиши: "я не знайшов аромат", "на жаль не знайшов", "можливо спробуйте інше".
- Навіть якщо цього аромату немає у нашій БД, ти описуєш його як орієнтир.
- Якщо є webPerfumeData, спирайся саме на webPerfumeData.
- Не вигадуй зайве, але якщо даних мало — опиши за доступним профілем.
- Фінал завжди має підводити до підбору схожих ароматів з бази.

Поверни JSON:
{
  "intro_text": ""
}

Вимоги:
- Українська мова.
- Стиль як у хорошого парфумерного консультанта.
- Компактно, але змістовно.
- Можна трохи емодзі.
- Включи: що це за аромат, характер звучання, ноти/акорди, кому/коли підходить, перехід до схожих з бази.
`;

  const user = JSON.stringify(
    {
      userText,
      perfume_data: data,
      webPerfumeData: webPerfumeData || null,
      analysis: analysis || null,
    },
    null,
    2,
  );

  try {
    const json = await chatJSON({
      system,
      user,
      temperature: 0.35,
    });

    const intro = String(json?.intro_text || "").trim();

    if (
      intro &&
      !/не\s+знайш(ов|ла|ли)|на\s+жаль|спробуйте\s+щось\s+інше|попробуйте\s+что/i.test(
        intro,
      )
    ) {
      return intro;
    }
  } catch (e) {
    console.error("writeReferencePerfumeIntro error:", e?.message || e);
  }

  return buildFallbackIntro(analysis, webPerfumeData);
}

module.exports = { writeReferencePerfumeIntro };
