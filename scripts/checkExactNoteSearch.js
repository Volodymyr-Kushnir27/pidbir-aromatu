require("dotenv").config();
const { findExactNoteMatches } = require("../src/search/exactNoteSearch");

const queries = process.argv.slice(2);
const list = queries.length ? queries : [
  "Аромат з кавуном",
  "підбери аромат кавуну",
  "жасмін",
  "аромат з жасмином",
  "персик",
  "аромат з персиком",
  "перець",
  "рожевий перець",
  "амбра",
  "мускус",
  "кедр",
  "сандал",
  "троянда",
  "бергамот",
  "ірис",
  "пачулі",
  "ветивер",
  "ваніль",
  "лимон",
  "кава",
  "тютюн",
  "шкіра",
];

for (const query of list) {
  const t0 = Date.now();
  const rows = findExactNoteMatches(query, { limit: 30 });
  console.log("\n==============================");
  console.log("QUERY:", query);
  console.log("TIME:", Date.now() - t0, "ms");
  console.log("COUNT:", rows.length);
  console.table(rows.slice(0, 30).map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.gender,
    score: x.match_score,
    name: x.name,
    why: (x.why_selected || []).join("; "),
  })));
}
