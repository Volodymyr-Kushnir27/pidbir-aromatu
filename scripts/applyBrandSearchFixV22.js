const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src/search/directNameKeywordSearch.js');

if (!fs.existsSync(target)) {
  console.error('❌ Не знайдено:', target);
  process.exit(1);
}

let s = fs.readFileSync(target, 'utf8');
const backup = `${target}.bak_v22_brand_search_${Date.now()}`;
fs.copyFileSync(target, backup);

if (!s.includes('BRAND_SEARCH_V22')) {
  const marker = 'const GENDER_WORDS = new Set([';
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error('Не знайдено GENDER_WORDS');

  const insertAfterGender = s.indexOf(']);', idx);
  if (insertAfterGender < 0) throw new Error('Не знайдено кінець GENDER_WORDS');

  const brandBlock = `

// BRAND_SEARCH_V22: strict brand aliases + name-first brand filtering
const BRAND_RULES_V22 = [
  {
    canonical: 'giorgio armani',
    label: 'Giorgio Armani',
    aliases: ['giorgio armani', 'armani', 'armany', 'армані', 'армани', 'джорджіо армані', 'джорджио армани', 'аква ді джио', 'аква ди джио', 'acqua di gio', 'acqua di giò'],
    nameNeedles: ['giorgio armani', 'armani'],
  },
  {
    canonical: 'jo malone',
    label: 'Jo Malone',
    aliases: ['jo malone', 'jo malone london', 'malone', 'джо малон', 'джо малоне', 'джо ма лон', 'джо ма лонг', 'джо малоун', 'жомалон', 'жо малон', 'жома лон', 'жома лонг', 'джомалон'],
    nameNeedles: ['jo malone', 'malone'],
  },
  {
    canonical: 'zielinski rozen',
    label: 'Zielinski & Rozen',
    aliases: ['zielinski', 'zielinski rozen', 'zielinski and rozen', 'zielinski rosen', 'зелінскі', 'зелински', 'зеленски', 'зелінський', 'зелінскі розен', 'зелински розен', 'зелінскі і розен', 'зелински и розен'],
    nameNeedles: ['zielinski', 'rozen', 'rosen'],
  },
  {
    canonical: 'chanel',
    label: 'Chanel',
    aliases: ['chanel', 'шанель', 'шанел', 'шанэль'],
    nameNeedles: ['chanel'],
  },
];

function normalizeGenderValueV22(value) {
  const g = norm(value);
  if (!g) return 'unknown';
  const hasUnisex = g.includes('унісекс') || g.includes('унисекс') || /\\bunisex\\b/.test(g);
  const hasFemale = g.includes('жіноч') || g.includes('женск') || /\\b(female|women|woman)\\b/.test(g);
  const hasMale = g.includes('чолов') || g.includes('мужск') || /\\b(male|men|man)\\b/.test(g);
  if (hasUnisex) return 'unisex';
  if (hasFemale && hasMale) return 'unisex';
  if (hasFemale) return 'female';
  if (hasMale) return 'male';
  return 'unknown';
}

function genderAllowedV22(itemGender, requestedGender) {
  const req = normalizeGenderValueV22(requestedGender);
  const item = normalizeGenderValueV22(itemGender);
  if (!req || req === 'unknown') return true;
  if (req === 'female') return item === 'female' || item === 'unisex';
  if (req === 'male') return item === 'male' || item === 'unisex';
  if (req === 'unisex') return item === 'unisex';
  return true;
}

function stripNoiseForBrandV22(value) {
  return norm(value)
    .split(/\\s+/)
    .filter(Boolean)
    .filter((x) => !INTENT_STOP_WORDS.has(x) && !GENDER_WORDS.has(x))
    .join(' ');
}

function detectBrandQueryV22(value) {
  const raw = stripNoiseForBrandV22(value);
  const cleaned = cleanDirectQuery(value);
  const hay = ` ${raw} ${cleaned} `;

  for (const brand of BRAND_RULES_V22) {
    const aliases = [...brand.aliases, brand.canonical].map(norm).filter(Boolean).sort((a, b) => b.length - a.length);
    const hit = aliases.find((a) => new RegExp(`(^|\\\\s)${escapeRegExp(a)}(?=\\\\s|$)`, 'i').test(hay));
    if (!hit) continue;

    const canonicalTokens = new Set(norm(brand.canonical).split(/\\s+/).filter(Boolean));
    const rest = norm(raw.replace(new RegExp(escapeRegExp(hit), 'i'), ''));
    const extraTokens = rest.split(/\\s+/).filter(Boolean).filter((x) => !canonicalTokens.has(x));
    return { ...brand, matchedAlias: hit, brandOnly: extraTokens.length === 0, extraTokens };
  }
  return null;
}

function itemNameMatchesBrandV22(item, brand) {
  if (!brand) return false;
  const name = applyCommonAliases(item?.name || '');
  return (brand.nameNeedles || [brand.canonical]).some((needle) => {
    const n = applyCommonAliases(needle);
    return new RegExp(`(^|\\\\s)${escapeRegExp(n)}(?=\\\\s|$)`, 'i').test(name);
  });
}
`;

  s = s.slice(0, insertAfterGender + 3) + brandBlock + s.slice(insertAfterGender + 3);
}

// Add brand aliases into getAliases() return array if they are absent.
if (!s.includes('["армані", "giorgio armani"]')) {
  s = s.replace(
    'return [',
    `return [
    // BRAND_SEARCH_V22 aliases
    ["giorgio armani", "giorgio armani"], ["armani", "giorgio armani"], ["armany", "giorgio armani"],
    ["армані", "giorgio armani"], ["армани", "giorgio armani"], ["джорджіо армані", "giorgio armani"], ["джорджио армани", "giorgio armani"],
    ["jo malone", "jo malone"], ["jo malone london", "jo malone"], ["malone", "jo malone"],
    ["джо малон", "jo malone"], ["джо малоне", "jo malone"], ["джо ма лон", "jo malone"], ["джо ма лонг", "jo malone"], ["джо малоун", "jo malone"], ["жомалон", "jo malone"], ["жома лонг", "jo malone"],
    ["zielinski", "zielinski rozen"], ["zielinski rozen", "zielinski rozen"], ["zielinski and rozen", "zielinski rozen"], ["zielinski rosen", "zielinski rozen"],
    ["зелінскі", "zielinski rozen"], ["зелински", "zielinski rozen"], ["зеленски", "zielinski rozen"], ["зелінський", "zielinski rozen"], ["зелінскі розен", "zielinski rozen"], ["зелински розен", "zielinski rozen"],
    ["chanel", "chanel"], ["шанель", "chanel"], ["шанел", "chanel"], ["шанэль", "chanel"],`
  );
}

const start = s.indexOf('function searchByNameAndKeywords(query, options = {}) {');
const end = s.indexOf('\nfunction hasStrongDirectMatch(items = [])', start);
if (start < 0 || end < 0) throw new Error('Не знайдено функцію searchByNameAndKeywords для заміни');

const newSearch = `function searchByNameAndKeywords(query, options = {}) {
  const start = Date.now();

  const limit = Number(options.limit || 30);
  const minScore = Number(options.minScore || 1200);
  const scanLimit = Number(options.scanLimit || 1000);

  const cleanedQuery = cleanDirectQuery(query);
  if (!cleanedQuery || cleanedQuery.length < 2) return [];

  const requestedGender = detectGenderFromQuery(query);
  const brandQuery = detectBrandQueryV22(query);
  const terms = buildPrefilterTerms(cleanedQuery);
  const allRows = getAllPerfumes(scanLimit);

  let prefiltered;

  if (brandQuery) {
    // BRAND_SEARCH_V22: if brand exists in NAME, ignore polluted version/keywords matches from other brands.
    prefiltered = allRows.filter((item) => itemNameMatchesBrandV22(item, brandQuery));
    if (!prefiltered.length) {
      prefiltered = allRows.filter((item) => rowContainsAnyTerm(item, terms));
    }
  } else {
    prefiltered = allRows.filter((item) => rowContainsAnyTerm(item, terms));
  }

  const scored = prefiltered
    .map((item) => {
      const candidates = unique([cleanedQuery, ...terms])
        .map((term) => scorePerfume(item, term))
        .filter(Boolean)
        .map((candidate) => ({
          ...candidate,
          match_score: Number(candidate.match_score || 0) + (brandQuery && itemNameMatchesBrandV22(candidate, brandQuery) ? 2500 : 0),
          _debug: {
            ...(candidate._debug || {}),
            brandSearchV22: brandQuery ? brandQuery.canonical : '',
          },
        }));

      if (!candidates.length) return null;
      candidates.sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0));
      return candidates[0];
    })
    .filter(Boolean)
    .filter((item) => Number(item.match_score || 0) >= minScore)
    .filter((item) => genderAllowedV22(item.gender, requestedGender))
    .sort((a, b) => {
      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
      if (diff !== 0) return diff;

      const ag = normalizeGenderValueV22(a.gender) === 'unisex' ? 0 : 1;
      const bg = normalizeGenderValueV22(b.gender) === 'unisex' ? 0 : 1;
      if (ag !== bg) return ag - bg;

      const fieldPriority = { "назва": 1, "версія": 2, "ключові слова": 3, "код": 4, "коди": 5 };
      const af = fieldPriority[String(a.direct_match_field || "")] || 99;
      const bf = fieldPriority[String(b.direct_match_field || "")] || 99;
      if (af !== bf) return af - bf;

      const typePriority = { exact_full: 1, exact_phrase: 2, exact_token: 3, token_overlap: 4, important_partial_token: 5, soft_token: 6, partial_token: 7 };
      const at = typePriority[String(a.direct_match_type || "")] || 99;
      const bt = typePriority[String(b.direct_match_type || "")] || 99;
      if (at !== bt) return at - bt;

      return Number(a.id || 0) - Number(b.id || 0);
    });

  const out = uniqById(scored).slice(0, Math.min(limit, 30));

  if (String(process.env.SEARCH_DEBUG || "0") === "1") {
    console.log("[directNameKeywordSearch:V22] done", {
      query,
      cleanedQuery,
      gender: requestedGender,
      brand: brandQuery?.canonical || null,
      terms,
      allRows: allRows.length,
      prefiltered: prefiltered.length,
      returned: out.length,
      top: out.slice(0, 8).map((x) => ({ id: x.id, code: x.number_code, gender: x.gender, name: x.name, score: x.match_score, field: x.direct_match_field })),
      ms: Date.now() - start,
    });
  }

  return out;
}
`;

s = s.slice(0, start) + newSearch + s.slice(end);

fs.writeFileSync(target, s);
console.log('backup:', backup);
console.log('patched:', path.relative(root, target));
console.log('Done. Run: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkBrandSearchV22.js');
