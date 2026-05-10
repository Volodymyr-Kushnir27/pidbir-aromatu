const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const file = path.join(ROOT, 'src/search/directNameKeywordSearch.js');

function backup(p) {
  const b = `${p}.bak_v21_direct_gender_${Date.now()}`;
  fs.copyFileSync(p, b);
  console.log('backup:', b);
}

function replaceOrInsert(src, pattern, replacement, label) {
  if (!pattern.test(src)) {
    throw new Error(`Cannot patch ${label}: anchor not found`);
  }
  return src.replace(pattern, replacement);
}

if (!fs.existsSync(file)) {
  throw new Error(`File not found: ${file}`);
}

backup(file);
let src = fs.readFileSync(file, 'utf8');

if (src.includes('DIRECT_BRAND_GENDER_FIX_V21')) {
  console.log('Already patched: DIRECT_BRAND_GENDER_FIX_V21');
  process.exit(0);
}

// 1) Add Chanel aliases after getAliases() return [
src = replaceOrInsert(
  src,
  /function getAliases\(\) \{\s*return \[/,
  `function getAliases() {\n  return [\n    // DIRECT_BRAND_GENDER_FIX_V21: Chanel brand aliases\n    ["шанель", "chanel"], ["шанел", "chanel"], ["шанель чоловічі", "chanel"],\n    ["шанель мужские", "chanel"], ["chanel", "chanel"], ["chanell", "chanel"], ["chanelle", "chanel"],`,
  'getAliases Chanel aliases'
);

// 2) Insert gender helpers after detectGenderFromQuery
const helperBlock = `

// DIRECT_BRAND_GENDER_FIX_V21
function getRowGender(item) {
  return item?.gender ?? item?.for_whom ?? item?.sex ?? item?.target_gender ?? "";
}

function normalizeDirectGenderValue(value) {
  const g = norm(String(value || ""));
  if (!g) return "unknown";

  const hasUnisex = g.includes("унісекс") || g.includes("унисекс") || /(^|\\s)unisex(?=\\s|$)/i.test(g);
  const hasFemale = g.includes("жіноч") || g.includes("женск") || /(^|\\s)(female|woman|women)(?=\\s|$)/i.test(g);
  const hasMale = g.includes("чолов") || g.includes("мужск") || /(^|\\s)(male|man|men)(?=\\s|$)/i.test(g);

  if (hasUnisex) return "unisex";
  if (hasFemale && hasMale) return "unisex";
  if (hasFemale) return "female";
  if (hasMale) return "male";
  return "unknown";
}

function directGenderAllowed(item, requestedGender) {
  const req = normalizeDirectGenderValue(requestedGender);
  const g = normalizeDirectGenderValue(getRowGender(item));
  if (!req || req === "unknown") return true;
  if (req === "male") return g === "male" || g === "unisex";
  if (req === "female") return g === "female" || g === "unisex";
  if (req === "unisex") return g === "unisex";
  return true;
}

function directGenderRank(item, requestedGender) {
  const req = normalizeDirectGenderValue(requestedGender);
  const g = normalizeDirectGenderValue(getRowGender(item));
  if (req === "male") {
    if (g === "male") return 0;
    if (g === "unisex") return 1;
    return 9;
  }
  if (req === "female") {
    if (g === "female") return 0;
    if (g === "unisex") return 1;
    return 9;
  }
  if (req === "unisex") {
    if (g === "unisex") return 0;
    return 9;
  }
  return 0;
}
`;

src = replaceOrInsert(
  src,
  /function getAliases\(\) \{/,
  helperBlock + '\nfunction getAliases() {',
  'insert gender helpers before getAliases'
);

// 3) Replace direct search rows + sort with gender-aware behavior.
src = src.replace(
  /const cleanedQuery = cleanDirectQuery\(query\);\n  if \(!cleanedQuery \|\| cleanedQuery\.length < 2\) return \[\];\n\n  const terms = buildPrefilterTerms\(cleanedQuery\);\n  const allRows = getAllPerfumes\(scanLimit\);\n  const prefiltered = allRows\.filter\(\(item\) => rowContainsAnyTerm\(item, terms\)\);/,
  `const cleanedQuery = cleanDirectQuery(query);\n  if (!cleanedQuery || cleanedQuery.length < 2) return [];\n\n  const requestedGender = options.gender || detectGenderFromQuery(query);\n  const terms = buildPrefilterTerms(cleanedQuery);\n  const allRows = getAllPerfumes(scanLimit);\n  const genderRows = allRows.filter((item) => directGenderAllowed(item, requestedGender));\n  const prefiltered = genderRows.filter((item) => rowContainsAnyTerm(item, terms));`
);

src = src.replace(
  /const diff = Number\(b\.match_score \|\| 0\) - Number\(a\.match_score \|\| 0\);\n      if \(diff !== 0\) return diff;\n\n      const fieldPriority = \{ "назва": 1, "версія": 2, "ключові слова": 3, "код": 4, "коди": 5 \};/,
  `const genderDiff = directGenderRank(a, requestedGender) - directGenderRank(b, requestedGender);\n      if (genderDiff !== 0) return genderDiff;\n\n      const diff = Number(b.match_score || 0) - Number(a.match_score || 0);\n      if (diff !== 0) return diff;\n\n      const fieldPriority = { "назва": 1, "версія": 2, "ключові слова": 3, "код": 4, "коди": 5 };`
);

src = src.replace(
  /allRows: allRows\.length,\n      prefiltered: prefiltered\.length,/,
  `allRows: allRows.length,\n      genderRows: genderRows.length,\n      requestedGender,\n      prefiltered: prefiltered.length,`
);

// 4) Export helper for tests.
src = src.replace(
  /detectGenderFromQuery,\n  tokenize,/,
  `detectGenderFromQuery,\n  normalizeDirectGenderValue,\n  directGenderAllowed,\n  tokenize,`
);

fs.writeFileSync(file, src);
console.log('patched:', path.relative(ROOT, file));
console.log('Done. Run: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkChanelGenderV21.js');
