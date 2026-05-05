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

function clean(value) {
  return String(value || "").trim();
}

function pickData(analysis, webPerfumeData) {
  const web = webPerfumeData || {};

  return {
    brand: clean(web.brand || analysis?.brand || ""),
    target_name: clean(
      web.target_name ||
        web.normalized_name ||
        analysis?.target_name ||
        analysis?.normalized_query ||
        analysis?.corrected_query ||
        "цей аромат",
    ),

    description: clean(web.description || web.short_summary || ""),
    gender: clean(web.gender || analysis?.gender || "unknown"),

    seasons: uniq([...(web.seasons || []), ...(analysis?.seasons || [])]),
    style: uniq([...(web.style || []), ...(analysis?.style || [])]),

    notes_top: uniq([...(web.notes_top || []), ...(analysis?.notes_top || [])]),
    notes_heart: uniq([
      ...(web.notes_heart || []),
      ...(analysis?.notes_heart || []),
    ]),
    notes_base: uniq([...(web.notes_base || []), ...(analysis?.notes_base || [])]),
    accords: uniq([...(web.accords || []), ...(analysis?.accords || [])]),

    search_terms: uniq([
      ...(web.search_terms || []),
      ...(analysis?.search_terms || []),
    ]),

    best_for: uniq([
      ...(web.best_for || []),
      ...(analysis?.intent_context?.best_for || []),
    ]),

    projection:
      web.projection ||
      analysis?.intent_context?.projection ||
      analysis?.projection ||
      "unknown",

    longevity:
      web.longevity ||
      analysis?.intent_context?.longevity ||
      analysis?.longevity ||
      "unknown",

    age_group:
      web.age_group ||
      analysis?.intent_context?.age_group ||
      analysis?.age_group ||
      "unknown",

    image_style: uniq([
      ...(web.image_style || []),
      ...(analysis?.intent_context?.image_style || []),
    ]),

    source_urls: uniq(web.source_urls || []),
  };
}

function humanGender(gender) {
  const g = clean(gender).toLowerCase();
  if (g === "male") return "чоловіків";
  if (g === "female") return "жінок";
  if (g === "unisex") return "унісекс";
  return "тих, кому подобається такий напрям";
}

function humanProjection(value) {
  const v = clean(value).toLowerCase();
  if (v === "strong") return "виразний / помітний";
  if (v === "medium") return "середній";
  if (v === "low") return "делікатний";
  return "залежить від шкіри та концентрації";
}

function humanLongevity(value) {
  const v = clean(value).toLowerCase();
  if (v === "long") return "добра / тривала";
  if (v === "medium") return "середня";
  if (v === "low") return "легка";
  return "залежить від шкіри та погоди";
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
  const accords = uniq([...data.accords, ...data.style]).slice(0, 8);
  const bestFor = data.best_for.slice(0, 4);
  const image = data.image_style.slice(0, 4);

  const lines = [];

  lines.push(`Привіт! ✨ Орієнтир — **${title}**.`);

  if (data.description) {
    lines.push(`\n${data.description}`);
  } else if (accords.length) {
    lines.push(`\nЗа характером це напрям: ${accords.join(", ")}.`);
  }

  const noteLines = [];
  if (notesTop.length) noteLines.push(`• старт: ${notesTop.join(", ")}`);
  if (notesHeart.length) noteLines.push(`• серце: ${notesHeart.join(", ")}`);
  if (notesBase.length) noteLines.push(`• база: ${notesBase.join(", ")}`);

  if (noteLines.length) {
    lines.push(`\n🌿 Ноти:\n${noteLines.join("\n")}`);
  }

  lines.push(`\n👤 Для кого: ${humanGender(data.gender)}.`);

  if (bestFor.length) {
    lines.push(`🕯 Коли носити: ${bestFor.join(", ")}.`);
  }

  if (data.seasons.length) {
    lines.push(`🍂 Сезон: ${data.seasons.slice(0, 4).join(", ")}.`);
  }

  if (image.length) {
    lines.push(`🎭 Вайб: ${image.join(", ")}.`);
  }

  lines.push(
    `🌫 Шлейф: ${humanProjection(data.projection)}. Стійкість: ${humanLongevity(
      data.longevity,
    )}.`,
  );

  lines.push(
    `\nЗараз підберу з бази найближчі варіанти за нотами, акордами й загальним характером.`,
  );

  return lines.join("\n");
}

async function writeReferencePerfumeIntro({ userText, analysis, webPerfumeData }) {
  const data = pickData(analysis, webPerfumeData);

  const system = `
Ти парфумерний консультант Telegram-бота.

Твоє завдання:
написати користувачу красивий, але конкретний опис зовнішнього аромату-орієнтира українською.

Поверни ТІЛЬКИ JSON:
{
  "intro_text": ""
}

КРИТИЧНО:
- НІКОЛИ не пиши: "не знайшов", "на жаль", "спробуйте щось інше", "аромат відсутній".
- Навіть якщо аромату немає в нашій БД, описуй його як ОРІЄНТИР для підбору.
- Якщо є webPerfumeData — спирайся саме на нього.
- Якщо webPerfumeData неповний — використовуй analysis.
- Не вигадуй бренд, якщо його немає, але можеш описати напрям за наявними нотами.
- Після опису обов'язково скажи, що зараз підбереш схожі варіанти з бази.

Структура intro_text:
1. "Привіт! Сьогодні говоримо про аромат..."
2. 2–4 речення: що це за аромат і як він звучить.
3. Блок нот:
   - старт / верхні ноти
   - серце
   - база
4. Кому підходить: чоловічий / жіночий / унісекс / вік / стиль.
5. Коли носити: сезон / день / вечір / побачення / офіс.
6. Шлейф і стійкість: якщо точних даних немає — обережно: "орієнтовно", "за характером".
7. Фінал: "Зараз підберу схожі варіанти з бази..."

Стиль:
- Українська мова.
- Не більше 1400 символів.
- Без markdown-таблиць.
- Можна 3–6 емодзі.
- Пиши як консультант, не як технічний JSON.
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

    const intro = clean(json?.intro_text);

    if (
      intro &&
      !/не\s+знайш(ов|ла|ли)|на\s+жаль|спробуйте\s+щось\s+інше|попробуйте\s+что|відсутн/i.test(
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

module.exports = {
  writeReferencePerfumeIntro,
  buildFallbackIntro,
  pickData,
};
