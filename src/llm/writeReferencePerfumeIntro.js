const { chatJSON } = require("./client");

function uniq(arr = []) {
  return [...new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function clean(value) {
  return String(value || "").trim();
}

function humanGender(gender) {
  const g = clean(gender).toLowerCase();
  if (g === "male") return "чоловіків";
  if (g === "female") return "жінок";
  if (g === "unisex") return "унісекс";
  return "тих, кому подобається цей напрям";
}

function humanProjection(value) {
  const v = clean(value).toLowerCase();
  if (v === "strong") return "виразний";
  if (v === "medium") return "середній";
  if (v === "low") return "делікатний";
  return "орієнтовно середній";
}

function humanLongevity(value) {
  const v = clean(value).toLowerCase();
  if (v === "long") return "добра";
  if (v === "medium") return "середня";
  if (v === "low") return "легка";
  return "орієнтовно середня";
}

function buildFallbackIntro(analysis) {
  const brand = clean(analysis?.brand);
  const name = clean(analysis?.target_name || analysis?.normalized_query || analysis?.corrected_query || "цей аромат");
  const title = brand && name && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${brand} ${name}`
    : name;

  const top = uniq(analysis?.notes_top).slice(0, 5);
  const heart = uniq(analysis?.notes_heart).slice(0, 5);
  const base = uniq(analysis?.notes_base).slice(0, 5);
  const accords = uniq([...(analysis?.accords || []), ...(analysis?.style || [])]).slice(0, 7);
  const seasons = uniq(analysis?.seasons).slice(0, 4);
  const bestFor = uniq(analysis?.intent_context?.best_for || []).slice(0, 4);
  const image = uniq(analysis?.intent_context?.image_style || []).slice(0, 4);

  const out = [];

  out.push(`Привіт! ✨ Орієнтир — ${title}.`);

  if (analysis?.description) {
    out.push(`\n${clean(analysis.description)}`);
  } else if (accords.length) {
    out.push(`\nЦе аромат у напрямі: ${accords.join(", ")}.`);
  }

  const notes = [];
  if (top.length) notes.push(`• старт: ${top.join(", ")}`);
  if (heart.length) notes.push(`• серце: ${heart.join(", ")}`);
  if (base.length) notes.push(`• база: ${base.join(", ")}`);

  if (notes.length) out.push(`\n🌿 Ноти:\n${notes.join("\n")}`);

  out.push(`\n👤 Для кого: ${humanGender(analysis?.gender)}.`);

  if (bestFor.length) out.push(`🕯 Коли носити: ${bestFor.join(", ")}.`);
  if (seasons.length) out.push(`🍂 Сезон: ${seasons.join(", ")}.`);
  if (image.length) out.push(`🎭 Вайб: ${image.join(", ")}.`);

  out.push(
    `🌫 Шлейф: ${humanProjection(analysis?.intent_context?.projection)}. ` +
      `Стійкість: ${humanLongevity(analysis?.intent_context?.longevity)}.`,
  );

  out.push(`\nЗараз підберу з бази найближчі варіанти за нотами, акордами й загальним характером.`);

  return out.join("\n");
}

async function writeReferencePerfumeIntro({ userText, analysis }) {
  const system = `
Ти парфумерний консультант Telegram-бота.

Поверни JSON:
{ "intro_text": "" }

Задача:
написати повний опис зовнішнього аромату-орієнтира українською.

КРИТИЧНО:
- Ніколи не пиши "не знайшов", "на жаль", "спробуйте інше".
- Навіть якщо аромату немає в нашій БД, описуй його як орієнтир.
- Обов'язково включи:
  1. що це за аромат
  2. ноти
  3. кому підходить
  4. сезон / випадок
  5. шлейф
  6. стійкість
  7. перехід до підбору схожих з бази
- До 1400 символів.
`;

  try {
    const json = await chatJSON({
      system,
      user: JSON.stringify({ userText, analysis }, null, 2),
      temperature: 0.35,
    });

    const intro = clean(json?.intro_text);

    if (
      intro &&
      !/не\s+знайш|на\s+жаль|спробуйте\s+щось\s+інше|відсутн/i.test(intro)
    ) {
      return intro;
    }
  } catch (e) {
    console.error("writeReferencePerfumeIntro error:", e?.message || e);
  }

  return buildFallbackIntro(analysis);
}

module.exports = {
  writeReferencePerfumeIntro,
  buildFallbackIntro,
};
