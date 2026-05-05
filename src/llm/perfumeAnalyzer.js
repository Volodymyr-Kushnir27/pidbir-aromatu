const { chatJSON, webJSON } = require("./client");

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

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .replace(/["'`’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const UK_TRANSLATIONS = new Map([
  ["lemon", "лимон"],
  ["citrus", "цитруси"],
  ["citron", "цитрон"],
  ["bergamot", "бергамот"],
  ["italian bergamot", "італійський бергамот"],
  ["orange", "апельсин"],
  ["orange blossom", "апельсиновий цвіт"],
  ["mandarin", "мандарин"],
  ["grapefruit", "грейпфрут"],
  ["neroli", "неролі"],
  ["candied lemon zest", "цукати з лимонної цедри"],
  ["lemon zest", "лимонна цедра"],
  ["lime", "лайм"],

  ["vanilla", "ваніль"],
  ["cream", "крем"],
  ["whipped cream", "збиті вершки"],
  ["sugar", "цукор"],
  ["biscuit", "бісквіт"],
  ["cookie", "печиво"],
  ["cookies", "печиво"],
  ["graham cracker crust", "основа з крекера"],
  ["cracker", "крекер"],
  ["dessert", "десертний акорд"],
  ["cake", "тістечко"],
  ["pie", "пиріг"],
  ["caramel", "карамель"],
  ["honey", "мед"],
  ["milk", "молоко"],
  ["condensed milk", "згущене молоко"],
  ["meringue", "меренга"],
  ["limoncello", "лімончелло"],

  ["jasmine", "жасмин"],
  ["rose", "троянда"],
  ["violet", "фіалка"],
  ["iris", "ірис"],
  ["peony", "півонія"],
  ["white flowers", "білі квіти"],
  ["floral", "квітковий"],

  ["musk", "мускус"],
  ["white musk", "білий мускус"],
  ["amber", "амбра"],
  ["cedar", "кедр"],
  ["sandalwood", "сандал"],
  ["patchouli", "пачулі"],
  ["vetiver", "ветивер"],
  ["tonka", "боби тонка"],
  ["tonka bean", "боби тонка"],

  ["tobacco", "тютюн"],
  ["rum", "ром"],
  ["whiskey", "віскі"],
  ["cognac", "коньяк"],
  ["vodka", "горілка"],
  ["boozy", "алкогольний"],
  ["alcoholic", "алкогольний"],

  ["pepper", "перець"],
  ["black pepper", "чорний перець"],
  ["pink pepper", "рожевий перець"],
  ["spicy", "пряний"],
  ["warm spicy", "тепло-пряний"],
  ["fresh spicy", "свіжо-пряний"],

  ["peach", "персик"],
  ["apple", "яблуко"],
  ["pear", "груша"],
  ["melon", "диня"],
  ["quince", "айва"],
  ["pineapple", "ананас"],
  ["black currant", "чорна смородина"],
  ["blackcurrant", "чорна смородина"],

  ["gourmand", "гурманський"],
  ["sweet", "солодкий"],
  ["creamy", "кремовий"],
  ["powdery", "пудровий"],
  ["fresh", "свіжий"],
  ["aquatic", "водний"],
  ["marine", "морський"],
  ["woody", "деревний"],
  ["musky", "мускусний"],
  ["fruity", "фруктовий"],
  ["citrusy", "цитрусовий"],
  ["green", "зелений"],
  ["clean", "чистий"],
  ["soft", "мʼякий"],
  ["playful", "грайливий"],
  ["nostalgic", "ностальгійний"],
  ["vintage", "вінтажний"],
  ["casual", "повсякденний"],
  ["daily", "на кожен день"],
  ["office", "офіс"],
  ["date", "побачення"],
  ["evening", "вечір"],
  ["day", "день"],
  ["spring", "весна"],
  ["summer", "літо"],
  ["autumn", "осінь"],
  ["fall", "осінь"],
  ["winter", "зима"],
]);

function toUk(value) {
  const raw = clean(value);
  if (!raw) return "";
  const key = raw.toLowerCase();
  return UK_TRANSLATIONS.get(key) || raw;
}

function translateListUk(arr = []) {
  return uniq(arr).map(toUk).filter(Boolean);
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
    /\b(схож(ий|е|і|а)|похож(ий|ее|ие|ая)|аналог|подобн(ый|ое|ые|ая)|like|similar|dupe|clone|inspired by|типу|підбери|подбери)\b/i.test(
      t,
    ) ||
    /\b(користуюсь|пользуюсь|маю|есть|є|ношу|люблю|подобається|нравится)\b/i.test(t)
  );
}

function containsStyleIntent(text) {
  const t = norm(text);

  return (
    /\b(свіж|сладк|солодк|пряний|деревн|древесн|зелений|зелёный|морський|морской|чистий|чистый|дымн|димн|мускусн|цитрус|фрукт|квітк|цветоч|шкіря|кожан|офіс|вечір|вечер|побачення|свидание|на каждый день|щодня|лето|зима|осінь|весна|тютюн|табак|tobacco|перець|перец|pepper|персик|peach|лимон|lemon|пиріг|pie|ваніль|vanilla|крем|cream|цукор|sugar|печиво|biscuit)\b/i.test(
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
  if (words.length <= 8) return cleaned;

  return words.slice(0, 8).join(" ");
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

function titleFrom(result) {
  const brand = clean(result?.brand);
  const name = clean(result?.target_name || result?.normalized_query || result?.corrected_query);

  if (brand && name && !name.toLowerCase().includes(brand.toLowerCase())) {
    return `${brand} ${name}`;
  }

  return name || brand || "цей аромат";
}

function seasonText(seasons = []) {
  const uk = translateListUk(seasons).filter((x) => !/young|adult|mature/i.test(x));
  return uk.length ? uk.slice(0, 4).join(", ") : "";
}

function bestForText(bestFor = []) {
  const filtered = uniq(bestFor).filter((x) => !/young|adult|mature/i.test(x));
  const uk = translateListUk(filtered);
  return uk.length ? uk.slice(0, 4).join(", ") : "";
}

function imageStyleText(image = []) {
  const uk = translateListUk(image).filter(Boolean);
  return uk.length ? uk.slice(0, 4).join(", ") : "";
}

function buildDetailedIntro(result) {
  const title = titleFrom(result);

  const top = translateListUk(result?.notes_top).slice(0, 5);
  const heart = translateListUk(result?.notes_heart).slice(0, 5);
  const base = translateListUk(result?.notes_base).slice(0, 5);
  const accords = translateListUk([...(result?.accords || []), ...(result?.style || [])]).slice(0, 7);

  const seasons = seasonText(result?.seasons);
  const bestFor = bestForText(result?.intent_context?.best_for || result?.best_for || []);
  const image = imageStyleText(result?.intent_context?.image_style || result?.image_style || []);

  const parts = [];

  parts.push(`Привіт! ✨ Орієнтир — ${title}.`);

  const desc = clean(result?.description || result?.short_summary);
  if (desc) {
    parts.push(`\n${desc}`);
  } else if (accords.length) {
    parts.push(`\nЦе аромат у напрямі: ${accords.join(", ")}.`);
  }

  const noteLines = [];
  if (top.length) noteLines.push(`• старт: ${top.join(", ")}`);
  if (heart.length) noteLines.push(`• серце: ${heart.join(", ")}`);
  if (base.length) noteLines.push(`• база: ${base.join(", ")}`);

  if (noteLines.length) {
    parts.push(`\n🌿 Ноти:\n${noteLines.join("\n")}`);
  }

  parts.push(`\n👤 Для кого: ${humanGender(result?.gender)}.`);

  if (seasons) {
    parts.push(`🍂 Сезон: ${seasons}.`);
  }

  if (bestFor) {
    parts.push(`🕯 Коли носити: ${bestFor}.`);
  }

  if (image) {
    parts.push(`🎭 Вайб: ${image}.`);
  }

  parts.push(
    `🌫 Шлейф: ${humanProjection(result?.intent_context?.projection || result?.projection)}. ` +
      `Стійкість: ${humanLongevity(result?.intent_context?.longevity || result?.longevity)}.`,
  );

  parts.push(`\nЗараз підберу з бази найближчі варіанти за нотами, акордами й загальним характером.`);

  return parts.join("\n");
}

function postNormalizeReferenceFields(result, userText) {
  const out = { ...(result || {}) };

  out.found = Boolean(out.found);
  out.query_type = out.query_type || "unknown";
  out.target_name = clean(out.target_name);
  out.brand = clean(out.brand);

  out.corrected_query = clean(out.corrected_query || userText);
  out.translated_query = clean(out.translated_query);
  out.normalized_query = clean(out.normalized_query || out.target_name || out.corrected_query);
  out.description = clean(out.description || out.short_summary);

  out.name_aliases = uniq(out.name_aliases);
  out.possible_names = uniq(out.possible_names);

  out.gender = ["male", "female", "unisex", "unknown"].includes(out.gender)
    ? out.gender
    : "unknown";

  out.seasons = translateListUk(out.seasons);
  out.style = translateListUk(out.style);
  out.notes_top = translateListUk(out.notes_top);
  out.notes_heart = translateListUk(out.notes_heart);
  out.notes_base = translateListUk(out.notes_base);
  out.accords = translateListUk(out.accords);
  out.search_terms = uniq(out.search_terms);

  out.intent_context = {
    best_for: translateListUk(out.intent_context?.best_for || out.best_for || []).filter(
      (x) => !/young|adult|mature/i.test(x),
    ),
    projection: ["low", "medium", "strong", "unknown"].includes(out.intent_context?.projection)
      ? out.intent_context.projection
      : clean(out.projection || "unknown"),
    longevity: ["low", "medium", "long", "unknown"].includes(out.intent_context?.longevity)
      ? out.intent_context.longevity
      : clean(out.longevity || "unknown"),
    age_group: ["young", "adult", "mature", "any", "unknown"].includes(out.intent_context?.age_group)
      ? out.intent_context.age_group
      : clean(out.age_group || "unknown"),
    image_style: translateListUk(out.intent_context?.image_style || out.image_style || []),
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
    ...out.notes_top,
    ...out.notes_heart,
    ...out.notes_base,
    ...out.accords,
    ...out.style,
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

  if (out.query_type === "reference_perfume") {
    out.user_friendly_reply = buildDetailedIntro(out);
    out.search_hint_text = `Орієнтир: ${titleFrom(out)}`;
  } else if (!out.user_friendly_reply) {
    out.user_friendly_reply = "Я проаналізував запит і підберу найближчі варіанти з бази.";
  }

  if (
    out.query_type === "reference_perfume" &&
    /не\s+знайш(ов|ла|ли)|на\s+жаль|спробуйте\s+щось\s+інше|відсутн/i.test(
      out.user_friendly_reply || "",
    )
  ) {
    out.user_friendly_reply = buildDetailedIntro(out);
  }

  return out;
}

async function webReferenceLookup(userText, baseAnalysis) {
  const target = clean(
    [
      baseAnalysis?.brand,
      baseAnalysis?.target_name || baseAnalysis?.normalized_query || extractDirectReferenceCandidate(userText),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!target || target.length < 3) return null;

  const system = `
You are a perfume researcher with web search.

Find fragrance information and return a structured perfume profile.

Return JSON only:
{
  "found": true,
  "brand": "",
  "target_name": "",
  "corrected_query": "",
  "translated_query": "",
  "normalized_query": "",
  "description": "",
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
  }
}

Rules:
- Use web search.
- Prefer official brand page, Fragrantica, Parfumo, retailer pages, perfume databases.
- If exact official notes are found, use them.
- If exact fragrance is not found, infer cautiously from reliable pages and the product name.
- Never write "not found" in description.
- Description must be Ukrainian user-friendly text: 2-4 sentences.
- All notes in description may be Ukrainian.
- For arrays notes_top/notes_heart/notes_base/search_terms use English or source terms; code will translate visible notes.
- Do NOT put age groups like young/adult/mature into best_for. Put age_group separately.
- For Sabrina Carpenter Sweet Tooth Lemon Pie: sweet gourmand lemon pie style; include lemon/citrus, vanilla/cream, sugar/biscuit/dessert/gourmand when supported.
`;

  const user = JSON.stringify(
    {
      userText,
      lookup_query: target,
      baseAnalysis,
      try_queries: [
        `${target} perfume notes`,
        `${target} fragrance notes`,
        `${target} Fragrantica`,
        `${target} Parfumo`,
      ],
    },
    null,
    2,
  );

  try {
    return await webJSON({
      system,
      user,
      temperature: 0.05,
    });
  } catch (e) {
    console.error("webReferenceLookup error:", e?.message || e);
    return null;
  }
}

async function analyzeBase(userText) {
  const directReferenceCandidate = extractDirectReferenceCandidate(userText);
  const hasReference = containsReferenceIntent(userText);
  const hasStyle = containsStyleIntent(userText);
  const maybeCode = looksLikeCode(userText);

  const system = `
Ти AI-консультант парфумерного Telegram-бота.

Завдання:
розібрати запит і повернути perfume profile для пошуку в БД.

Поверни JSON:
{
  "found": true,
  "query_type": "reference_perfume|note_search|style_search|code_search|unknown",
  "target_name": "",
  "brand": "",
  "corrected_query": "",
  "translated_query": "",
  "normalized_query": "",
  "description": "",
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

КРИТИЧНО:
- Якщо користувач просить "схожий на [назва/бренд]" — це reference_perfume.
- НЕ пиши "не знайшов", "на жаль", "спробуйте інше".
- Для reference_perfume user_friendly_reply має бути повним описом.
- Якщо інформації мало — все одно дай обережний профіль за назвою/брендом, але не відмовляйся.
- Не став young/adult/mature у best_for. Це тільки age_group.
- Якщо запит: "Sabrina Carpenter Lemon Pie", розпізнай як:
  brand: "Sabrina Carpenter", target_name: "Sweet Tooth Lemon Pie" або "Lemon Pie",
  стиль: sweet gourmand lemon pie, lemon/citrus, vanilla/cream, sugar/biscuit/dessert.
- Якщо запит "плохая девочка" або "погана дівчинка" — це Good Girl Gone Bad / Good Girl.
- Якщо запит "лакоста" — Lacoste.
- Якщо запит "габа" — GABA / Hormone GABA, НЕ Gabbana.
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
    temperature: 0.1,
  });

  if (!json) {
    const fallbackTarget = hasReference ? directReferenceCandidate : "";
    return {
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
      description: "",
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
    };
  }

  return json;
}

function mergeAnalysis(base, web) {
  if (!web) return base;

  return {
    ...(base || {}),
    ...(web || {}),

    brand: clean(web.brand || base?.brand),
    target_name: clean(web.target_name || base?.target_name),
    corrected_query: clean(web.corrected_query || base?.corrected_query),
    translated_query: clean(web.translated_query || base?.translated_query),
    normalized_query: clean(web.normalized_query || base?.normalized_query),

    description: clean(web.description || base?.description),

    gender: clean(web.gender || base?.gender || "unknown"),

    seasons: uniq([...(base?.seasons || []), ...(web?.seasons || [])]),
    style: uniq([...(base?.style || []), ...(web?.style || [])]),
    notes_top: uniq([...(base?.notes_top || []), ...(web?.notes_top || [])]),
    notes_heart: uniq([...(base?.notes_heart || []), ...(web?.notes_heart || [])]),
    notes_base: uniq([...(base?.notes_base || []), ...(web?.notes_base || [])]),
    accords: uniq([...(base?.accords || []), ...(web?.accords || [])]),

    search_terms: uniq([...(base?.search_terms || []), ...(web?.search_terms || [])]),

    intent_context: {
      best_for: uniq([
        ...(base?.intent_context?.best_for || []),
        ...(web?.intent_context?.best_for || []),
      ]),
      projection:
        web?.intent_context?.projection ||
        base?.intent_context?.projection ||
        "unknown",
      longevity:
        web?.intent_context?.longevity ||
        base?.intent_context?.longevity ||
        "unknown",
      age_group:
        web?.intent_context?.age_group ||
        base?.intent_context?.age_group ||
        "unknown",
      image_style: uniq([
        ...(base?.intent_context?.image_style || []),
        ...(web?.intent_context?.image_style || []),
      ]),
    },
  };
}

async function analyzePerfumeIntent(userText) {
  const base = await analyzeBase(userText);

  let merged = base;

  if (base?.query_type === "reference_perfume") {
    const useWeb = String(process.env.PERFUME_WEB_LOOKUP || "1") !== "0";
    if (useWeb) {
      const web = await webReferenceLookup(userText, base);
      merged = mergeAnalysis(base, web);
    }
  }

  return postNormalizeReferenceFields(merged, userText);
}

module.exports = {
  analyzePerfumeIntent,
  translateListUk,
  toUk,
};
