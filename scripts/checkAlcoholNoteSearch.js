require("dotenv").config();

const { findExactNoteMatches } = require("../src/search/exactNoteSearch");
const { parseLocalQuery } = require("../src/search/queryNormalizer");
const { searchByNameAndKeywords } = require("../src/search/directNameKeywordSearch");

const queries = [
  "Парфуми з запахом рому чи віскі",
  "аромат з ромом",
  "аромат з рому",
  "ром",
  "віскі",
  "whiskey",
  "коньяк",
  "лікер",
  "шампанське",
];

for (const query of queries) {
  const local = parseLocalQuery(query);
  const t0 = Date.now();
  const exact = findExactNoteMatches(query, { limit: 30 });
  const ms = Date.now() - t0;

  console.log("\n==============================");
  console.log("QUERY:", query);
  console.log("LOCAL:", local);
  console.log("TIME:", ms, "ms");
  console.log("EXACT NOTE COUNT:", exact.length);
  console.table(exact.slice(0, 30).map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.gender,
    score: x.match_score,
    field: x.direct_match_field,
    name: x.name,
    why: Array.isArray(x.why_selected) ? x.why_selected.join(" | ") : "",
  })));

  const direct = searchByNameAndKeywords(query, { limit: 5 });
  console.log("DIRECT COUNT:", direct.length);
  console.table(direct.slice(0, 5).map((x) => ({
    id: x.id,
    code: x.number_code,
    field: x.direct_match_field,
    type: x.direct_match_type,
    score: x.match_score,
    name: x.name,
  })));
}
