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
    /\b(свіж|сладк|солодк|пряний|деревн|древесн|зелений|зелёный|морський|морской|чистий|чистый|дымн|димн|мускусн|цитрус|фрукт|квітк|цветоч|шкіря|кожан|офіс|вечір|вечер|побачення|свидание|на каждый день|щодня|лето|зима|осінь|весна)\b/i.test(
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

Твоє завдання:
1. Правильно визначити тип запиту користувача.
2. Якщо користувач назвав КОНКРЕТНИЙ аромат, навіть якщо він НЕ з бази, розпізнати його як reference_perfume.
3. Якщо це відомий аромат або комерційна інтерпретація/аналог аромату, спробувати відновити:
   - назву
   - бренд
   - ноти
   - акорди
   - характер
   - сезонність
4. Повернути тільки JSON.

Можливі query_type:
- "reference_perfume"
- "note_search"
- "style_search"
- "code_search"
- "unknown"

ФОРМАТ:
{
  "found": true,
  "query_type": "reference_perfume|note_search|style_search|code_search|unknown",
  "target_name": "",
  "brand": "",
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

ДУЖЕ ВАЖЛИВО:
- Якщо користувач називає аромат, навіть коротко, типу:
  - "Gaba"
  - "TWINS Gaba"
  - "Sweet Peony"
  - "Black Opium"
  - "користуюсь ароматом Gaba"
  - "підбери щось схоже на TWINS Gaba"
  це ТРЕБА трактувати як reference_perfume, а не style_search.
- Якщо це бренд + модель, поверни і brand, і target_name.
- Якщо це просто бренд без моделі (наприклад тільки "Yves Saint Laurent"), тоді теж можна ставити reference_perfume, але target_name лишається загальнішим, а ноти — тільки якщо дійсно впевнений.
- Якщо аромат схожий на відомий референс або є клон/інтерпретація, можна використати знання про цей аромат, щоб витягнути ноти та акорди.
- Якщо в назві є слова типу "Gaba", "Sweet Peony", "Rose Petals", "Black Opium", "Libre", "Y", "Toy Boy", "The Hedonist" — це НЕ unknown.
- Якщо бачиш в запиті назву аромату + фрази "схоже", "аналог", "підкажи схожий", це майже завжди reference_perfume.

ПРАВИЛА:
- Якщо запит схожий на код: 60, 377A, 609А -> code_search.
- Якщо користувач шукає конкретну ноту або акорд -> note_search.
- Якщо користувач описує стиль без конкретної назви -> style_search.
- Якщо є достатньо підстав вважати, що це конкретний аромат -> reference_perfume.
- Якщо користувач вказує сімейства/дескриптори (наприклад: "свіжий фруктовий", "цитрусовий", "зелений", "морський"),
  обов'язково додай релевантні ноти/акорди у notes_top/notes_heart/notes_base/accords/search_terms.
- Не пиши води.
- Не пиши довгих вступів.
- user_friendly_reply:
  - для reference_perfume: 1 коротке речення
  - для інших: теж коротко
- Якщо не знаєш точних нот — поверни найбільш імовірні акорди/стиль, але НЕ залишай усе пустим, якщо явно є конкретний аромат.
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
    temperature: 0.25,
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
        gender: "unknown",
        seasons: [],
        style: [],
        notes_top: [],
        notes_heart: [],
        notes_base: [],
        accords: [],
        search_terms: fallbackTarget ? [fallbackTarget] : [],
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