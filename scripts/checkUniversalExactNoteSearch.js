require("dotenv").config();

const { parseLocalQuery } = require("../src/search/queryNormalizer");
const { findExactNoteMatches } = require("../src/search/exactNoteSearch");

const queries = [
  "слива",
  "аромат зі сливою",
  "мед",
  "парфум з медом",
  "фіалка",
  "аромат з фіалкою",
  "м'ята",
  "аромат з мʼятою",
  "вишня",
  "шлейфовий парфум з вишнею",
  "парфуми з запахом рому чи віскі",
  "ром",
  "віскі",
  "жасмін",
  "персик",
  "перець",
  "амбра",
  "мускус",
  "кедр",
  "сандал",
  "бергамот",
  "ірис",
  "пачулі",
  "ветивер",
  "кавун",
  "підбери аромат кавуну",
];

for (const query of queries) {
  const local = parseLocalQuery(query);
  const t0 = Date.now();
  const results = findExactNoteMatches(query, { limit: 30, gender: local.gender });
  const ms = Date.now() - t0;

  console.log("\n==============================");
  console.log("QUERY:", query);
  console.log("EXPLICIT:", local.isExplicitNoteQuery);
  console.log("NOTES:", local.explicitNotes);
  console.log("STYLE:", local.styleTerms);
  console.log("TIME:", `${ms} ms`);
  console.log("COUNT:", results.length);
  console.table(results.slice(0, 10).map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.gender,
    score: Math.round(x.match_score || 0),
    field: x.direct_match_field,
    name: x.name,
    why: (x.why_selected || []).join(" | "),
  })));
}
