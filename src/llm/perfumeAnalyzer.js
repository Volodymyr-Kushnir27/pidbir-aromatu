const { chatJSON } = require("./client");

function uniq(arr = []) {
  return [...new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean))];
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["'`’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCyrillic(str) {
  return /[а-яіїєґ]/i.test(String(str || ""));
}

function hasLatin(str) {
  return /[a-z]/i.test(String(str || ""));
}

function extractQuotedNames(text) {
  const matches = [];
  const re = /["«„“](.+?)["»”]/g;
  let m;

  while ((m = re.exec(String(text || "")))) {
    if (m[1]) matches.push(m[1].trim());
  }

  return uniq(matches);
}

function looksLikeCode(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return /\b\d{1,4}[a-zа-яіїєґ]?\b/i.test(t);
}

function containsReferenceIntent(text) {
  const t = norm(text);

  return (
    /\b(схож(ий|е|і|а)|похож(ий|ее|ие|ая)|аналог|подобн(ый|ое|ые|ая)|like|similar|dupe|clone|inspired by)\b/i.test(
      t,
    ) ||
    /\b(користуюсь|пользуюсь|маю|есть|є|ношу|люблю|подобається|нравится)\b/i.test(t)
  );
}

function containsStyleIntent(text) {
  const t = norm(text);

  return (
    /\b(свіж|сладк|солодк|пряний|деревн|древесн|зелений|зелёный|морський|морской|чистий|чистый|дымн|димн|мускусн|цитрус|фрукт|квітк|цветоч|шкіря|кожан|офіс|вечір|вечер|побачення|свидание|на каждый день|щодня|лето|зима|осінь|весна|тютюн|табак|tobacco|перець|перец|pepper|персик|peach)\b/i.test(
      t,
    )
  );
}

function extractDirectReferenceCandidate(text) {
  const raw = String(text || "").trim();
  const quoted = extractQuotedNames(raw);
  if (quoted.length) return quoted[0];

  let cleaned = raw
    .replace(/\b(я\s+)?(користуюсь|користуюся|пользуюсь|ношу|люблю|маю|есть|є)\b/gi, " ")
    .replace(/\b(аромат(ом|у)?|парфум(ом|у)?|духами?|perfume|fragrance)\b/gi, " ")
    .replace(/\b(підкажи|подскажи|знайди|найди|підбери|подбери|дай|що-небудь|щось)\b/gi, " ")
    .replace(/\b(схоже|похожее|похожий|аналог|similar|like)\b/gi, " ")
    .replace(/[!?.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const words = cleaned.split(" ");
  if (words.length <= 6) return cleaned;

  return words.slice(0, 6).join(" ");
}

function postNormalizeReferenceFields(result, userText) {
  const out = { ...(result || {}) };

  out.found = Boolean(out.found);
  out.query_type = out.query_type || "unknown";
  out.target_name = String(out.target_name || "").trim();
  out.brand = String(out.brand || "").trim();

  out.corrected_query = String(out.corrected_query || "").trim();
  out.translated_query = String(out.translated_query || "").trim();
  out.normalized_query = String(out.normalized_query || "").trim();
  out.name_aliases = uniq(out.name_aliases);
  out.possible_names = uniq(out.possible_names);

  out.gender = ["male", "female", "unisex", "unknown"].includes(out.gender)
    ? out.gender
    : "unknown";

  out.seasons = uniq(out.seasons);
  out.style = uniq(out.style);
  out.notes_top = uniq(out.notes_top);
  out.notes_heart = uniq(out.notes_heart);
  out.notes_base = uniq(out.notes_base);
  out.accords = uniq(out.accords);
  out.search_terms = uniq(out.search_terms);

  out.intent_context = {
    best_for: uniq(out.intent_context?.best_for || []),
    projection: ["low", "medium", "strong", "unknown"].includes(out.intent_context?.projection)
      ? out.intent_context.projection
      : "unknown",
    longevity: ["low", "medium", "long", "unknown"].includes(out.intent_context?.longevity)
      ? out.intent_context.longevity
      : "unknown",
    age_group: ["young", "adult", "mature", "any", "unknown"].includes(out.intent_context?.age_group)
      ? out.intent_context.age_group
      : "unknown",
    image_style: uniq(out.intent_context?.image_style || []),
  };

  const allSearch = [
    ...out.search_terms,
    out.corrected_query,
    out.translated_query,
    out.normalized_query,
    out.target_name,
    out.brand,
    ...out.name_aliases,
    ...out.possible_names,
  ];

  out.search_terms = uniq(allSearch);

  if (
    out.query_type === "reference_perfume" &&
    !out.target_name &&
    containsReferenceIntent(userText)
  ) {
    const fallbackTarget = extractDirectReferenceCandidate(userText);
    if (fallbackTarget) out.target_name = fallbackTarget;
  }

  if (
    out.query_type === "reference_perfume" &&
    out.target_name &&
    !out.search_terms.length
  ) {
    out.search_terms = uniq([
      out.target_name,
      out.brand,
      ...out.name_aliases,
      ...out.possible_names,
      ...out.notes_top,
      ...out.notes_heart,
      ...out.notes_base,
      ...out.accords,
      ...out.style,
    ]);
  }

  if (
    out.query_type === "reference_perfume" &&
    out.target_name &&
    !out.user_friendly_reply
  ) {
    out.user_friendly_reply = `Зрозумів орієнтир: ${out.target_name}. Зараз коротко опишу аромат і підберу схожі варіанти з бази.`;
  }

  if (!out.search_hint_text && out.query_type === "reference_perfume" && out.target_name) {
    out.search_hint_text = `Орієнтир: ${out.target_name}`;
  }

  return out;
}

async function analyzePerfumeIntent(userText) {
  const directReferenceCandidate = extractDirectReferenceCandidate(userText);
  const hasReference = containsReferenceIntent(userText);
  const hasStyle = containsStyleIntent(userText);
  const maybeCode = looksLikeCode(userText);

  const system = `
Ти AI-консультант парфумерного Telegram-бота.

Головна задача:
AI НЕ має замінювати базу даних.
AI має розібрати запит, виправити орфографію, перекласти назви/ноти за потреби і повернути пошукові слова для повторного пошуку в БД.

Можливі query_type:
- "reference_perfume"
- "note_search"
- "style_search"
- "code_search"
- "unknown"

ФОРМАТ JSON:
{
  "found": true,
  "query_type": "reference_perfume|note_search|style_search|code_search|unknown",
  "target_name": "",
  "brand": "",
  "corrected_query": "",
  "translated_query": "",
  "normalized_query": "",
  "name_aliases": [],
  "possible_names": [],
  "gender": "male|female|unisex|unknown",
  "seasons": [],
  "style": [],
  "notes_top": [],
  "notes_heart": [],
  "notes_base": [],
  "accords": [],
  "search_terms": [],
  "intent_context": {
    "best_for": [],
    "projection": "low|medium|strong|unknown",
    "longevity": "low|medium|long|unknown",
    "age_group": "young|adult|mature|any|unknown",
    "image_style": []
  },
  "user_friendly_reply": "",
  "search_hint_text": ""
}

КРИТИЧНО ВАЖЛИВО:
- Якщо користувач вводить переклад, трансліт або помилкову назву аромату, НЕ вигадуй новий аромат.
- Спочатку визнач можливу оригінальну назву, виправ орфографію, переклади за потреби і поверни варіанти для пошуку в базі.
- Якщо запит "плохая девочка" або "погана дівчинка", це НЕ новий аромат Twins. Це можливий alias до "Good Girl Gone Bad" / "Good Girl".
- Якщо запит "гарна дівчинка", це можливий alias до "Good Girl".
- Якщо запит "лакоста", це Lacoste / Лакост.
- Якщо запит "габа", це GABA / Hormone GABA, НЕ Gabbana.

ПРИКЛАДИ:
"плохая девочка" ->
{
  "query_type": "reference_perfume",
  "target_name": "Good Girl Gone Bad",
  "corrected_query": "плохая девочка",
  "translated_query": "bad girl",
  "normalized_query": "good girl gone bad",
  "possible_names": ["Good Girl Gone Bad", "Good Girl"],
  "name_aliases": ["плохая девочка", "погана дівчинка", "good girl gone bad", "good girl"],
  "search_terms": ["good girl gone bad", "good girl", "girl", "плохая девочка", "погана дівчинка"]
}

"гарна дівчинка" ->
{
  "query_type": "reference_perfume",
  "target_name": "Good Girl",
  "normalized_query": "good girl",
  "possible_names": ["Good Girl", "Very Good Girl"],
  "name_aliases": ["гарна дівчинка", "хорошая девочка", "good girl"],
  "search_terms": ["good girl", "very good girl", "гарна дівчинка"]
}

"лакоста" ->
{
  "query_type": "reference_perfume",
  "target_name": "Lacoste",
  "brand": "Lacoste",
  "normalized_query": "lacoste",
  "name_aliases": ["лакоста", "лакост", "lacoste"],
  "search_terms": ["lacoste", "лакоста", "лакост"]
}

"габа" ->
{
  "query_type": "reference_perfume",
  "target_name": "GABA",
  "normalized_query": "gaba",
  "possible_names": ["GABA", "Hormone GABA"],
  "name_aliases": ["габа", "gaba", "hormone"],
  "search_terms": ["gaba", "габа", "hormone", "hormone gaba"]
}

"аромат тютюну" ->
{
  "query_type": "note_search",
  "corrected_query": "аромат тютюну",
  "translated_query": "tobacco fragrance",
  "normalized_query": "tobacco",
  "notes_top": ["tobacco"],
  "accords": ["tobacco", "smoky", "warm spicy"],
  "search_terms": ["тютюн", "табак", "tobacco", "smoky", "димний"]
}

ПРАВИЛА:
- Якщо запит схожий на код: 60, 377A, 609А -> code_search.
- Якщо користувач шукає конкретну ноту або акорд -> note_search.
- Якщо користувач описує стиль без конкретної назви -> style_search.
- Якщо є достатньо підстав вважати, що це конкретний аромат -> reference_perfume.
- search_terms завжди заповнюй практичними словами для пошуку в БД.
- Не пиши воду.
- Поверни тільки JSON.
`;

  const user = JSON.stringify(
    {
      userText,
      hints: {
        directReferenceCandidate,
        hasReference,
        hasStyle,
        maybeCode,
        hasCyrillic: hasCyrillic(userText),
        hasLatin: hasLatin(userText),
      },
    },
    null,
    2,
  );

  const json = await chatJSON({
    system,
    user,
    temperature: 0.15,
  });

  if (!json) {
    const fallbackTarget = hasReference ? directReferenceCandidate : "";
    return postNormalizeReferenceFields(
      {
        found: Boolean(fallbackTarget),
        query_type: fallbackTarget
          ? "reference_perfume"
          : maybeCode
            ? "code_search"
            : hasStyle
              ? "style_search"
              : "unknown",
        target_name: fallbackTarget,
        brand: "",
        corrected_query: userText,
        translated_query: "",
        normalized_query: fallbackTarget || userText,
        name_aliases: fallbackTarget ? [fallbackTarget] : [],
        possible_names: fallbackTarget ? [fallbackTarget] : [],
        gender: "unknown",
        seasons: [],
        style: [],
        notes_top: [],
        notes_heart: [],
        notes_base: [],
        accords: [],
        search_terms: fallbackTarget ? [fallbackTarget] : [userText],
        intent_context: {
          best_for: [],
          projection: "unknown",
          longevity: "unknown",
          age_group: "unknown",
          image_style: [],
        },
        user_friendly_reply: fallbackTarget
          ? `Зрозумів орієнтир: ${fallbackTarget}.`
          : "Не до кінця зрозумів запит. Напишіть назву аромату, код, ноти або стиль.",
        search_hint_text: fallbackTarget ? `Орієнтир: ${fallbackTarget}` : "",
      },
      userText,
    );
  }

  return postNormalizeReferenceFields(
    {
      found: Boolean(json.found),
      query_type: json.query_type || "unknown",
      target_name: json.target_name || "",
      brand: json.brand || "",

      corrected_query: json.corrected_query || "",
      translated_query: json.translated_query || "",
      normalized_query: json.normalized_query || "",
      name_aliases: Array.isArray(json.name_aliases) ? json.name_aliases : [],
      possible_names: Array.isArray(json.possible_names) ? json.possible_names : [],

      gender: json.gender || "unknown",
      seasons: Array.isArray(json.seasons) ? json.seasons : [],
      style: Array.isArray(json.style) ? json.style : [],
      notes_top: Array.isArray(json.notes_top) ? json.notes_top : [],
      notes_heart: Array.isArray(json.notes_heart) ? json.notes_heart : [],
      notes_base: Array.isArray(json.notes_base) ? json.notes_base : [],
      accords: Array.isArray(json.accords) ? json.accords : [],
      search_terms: Array.isArray(json.search_terms) ? json.search_terms : [],
      intent_context: {
        best_for: Array.isArray(json.intent_context?.best_for)
          ? json.intent_context.best_for
          : [],
        projection: json.intent_context?.projection || "unknown",
        longevity: json.intent_context?.longevity || "unknown",
        age_group: json.intent_context?.age_group || "unknown",
        image_style: Array.isArray(json.intent_context?.image_style)
          ? json.intent_context.image_style
          : [],
      },
      user_friendly_reply: json.user_friendly_reply || "",
      search_hint_text: json.search_hint_text || "",
    },
    userText,
  );
}

module.exports = { analyzePerfumeIntent };
