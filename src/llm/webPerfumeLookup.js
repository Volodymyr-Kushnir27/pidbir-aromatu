const { webJSON } = require("./client");

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

function mergeTerms(data) {
  return uniq([
    ...(data?.search_terms || []),
    data?.brand,
    data?.target_name,
    data?.normalized_name,
    ...(data?.possible_names || []),
    ...(data?.name_aliases || []),
    ...(data?.notes_top || []),
    ...(data?.notes_heart || []),
    ...(data?.notes_base || []),
    ...(data?.accords || []),
    ...(data?.style || []),
  ]);
}

function normalizeLookupResult(json, fallbackAnalysis = {}) {
  const data = json || {};

  const out = {
    found: Boolean(data.found),
    confidence:
      typeof data.confidence === "number"
        ? Math.max(0, Math.min(1, data.confidence))
        : 0,

    brand: clean(data.brand || fallbackAnalysis?.brand),
    target_name: clean(
      data.target_name ||
        data.name ||
        fallbackAnalysis?.target_name ||
        fallbackAnalysis?.normalized_query,
    ),
    normalized_name: clean(data.normalized_name || data.normalized_query),

    description: clean(data.description),
    short_summary: clean(data.short_summary),

    gender: clean(data.gender || fallbackAnalysis?.gender || "unknown"),
    seasons: uniq(data.seasons || fallbackAnalysis?.seasons || []),
    style: uniq(data.style || fallbackAnalysis?.style || []),

    notes_top: uniq(data.notes_top || fallbackAnalysis?.notes_top || []),
    notes_heart: uniq(data.notes_heart || fallbackAnalysis?.notes_heart || []),
    notes_base: uniq(data.notes_base || fallbackAnalysis?.notes_base || []),
    accords: uniq(data.accords || fallbackAnalysis?.accords || []),

    possible_names: uniq(data.possible_names || fallbackAnalysis?.possible_names || []),
    name_aliases: uniq(data.name_aliases || fallbackAnalysis?.name_aliases || []),

    source_urls: uniq(data.source_urls || []),
    source_names: uniq(data.source_names || []),

    search_terms: [],
  };

  out.search_terms = mergeTerms({
    ...out,
    search_terms: uniq(data.search_terms || fallbackAnalysis?.search_terms || []),
  });

  // Якщо web не дав source, але дав профіль, все одно дозволяємо використати як профіль.
  if (!out.found && (out.notes_top.length || out.accords.length || out.description)) {
    out.found = true;
    out.confidence = Math.max(out.confidence, 0.55);
  }

  return out;
}

async function lookupPerfumeOnWeb({ userText, analysis }) {
  const target = clean(
    [
      analysis?.brand,
      analysis?.target_name || analysis?.normalized_query || analysis?.corrected_query,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const query = target || clean(userText);

  if (!query || query.length < 3) {
    return normalizeLookupResult(null, analysis);
  }

  const system = `
You are a perfume research assistant with web search access.

Task:
Find reliable web information about a fragrance/perfume and return a structured perfume profile.

Return JSON only:
{
  "found": true,
  "confidence": 0.0,
  "brand": "",
  "target_name": "",
  "normalized_name": "",
  "possible_names": [],
  "name_aliases": [],

  "description": "",
  "short_summary": "",

  "gender": "male|female|unisex|unknown",
  "seasons": [],
  "style": [],

  "notes_top": [],
  "notes_heart": [],
  "notes_base": [],
  "accords": [],

  "search_terms": [],
  "source_urls": [],
  "source_names": []
}

Rules:
- Use web search.
- Prioritize official brand pages, Fragrantica, Parfumo, retailer pages, and reputable perfume databases.
- If exact perfume is not found, find the closest exact official/name match, but do not invent a fake product.
- If source notes are listed, use them.
- If only a description is available, extract likely searchable accords/terms but mark confidence lower.
- Translate useful terms into both English and Ukrainian/Russian when helpful for DB search.
- For gourmand/dessert perfumes, include terms like gourmand, sweet, vanilla, sugar, biscuit, creamy, dessert when supported.
- For citrus perfumes, include citrus/lemon/orange/bergamot terms when supported.
- For aquatic perfumes, include aquatic/marine/ozonic only when supported.
- Never say "not found" in description. Use found=false only in JSON if no reliable reference found.
`;

  const user = JSON.stringify(
    {
      userText,
      lookup_query: query,
      analysis_hint: {
        query_type: analysis?.query_type,
        brand: analysis?.brand,
        target_name: analysis?.target_name,
        corrected_query: analysis?.corrected_query,
        translated_query: analysis?.translated_query,
        normalized_query: analysis?.normalized_query,
        possible_names: analysis?.possible_names,
        name_aliases: analysis?.name_aliases,
        search_terms: analysis?.search_terms,
      },
      web_search_queries_to_try: [
        `${query} perfume notes`,
        `${query} fragrance notes`,
        `${query} Fragrantica`,
        `${query} Parfumo`,
      ],
    },
    null,
    2,
  );

  try {
    const json = await webJSON({
      system,
      user,
      temperature: 0.05,
    });

    return normalizeLookupResult(json, analysis);
  } catch (e) {
    console.error("lookupPerfumeOnWeb error:", e?.message || e);
    return normalizeLookupResult(null, analysis);
  }
}

module.exports = {
  lookupPerfumeOnWeb,
  normalizeLookupResult,
};
