require("dotenv").config();
const { findExactNoteMatches } = require("../src/search/exactNoteSearch");

const queries = [
  "Аромат з кавуном",
  "підбери аромат кавуну",
  "з нотою кавуна",
  "аромат watermelon",
  "персик",
  "аромат з персиком",
];

for (const query of queries) {
  const t0 = Date.now();
  const rows = findExactNoteMatches(query, { limit: 30 });
  console.log("\n==============================");
  console.log(`QUERY: ${query}`);
  console.log(`TIME: ${Date.now() - t0} ms`);
  console.log(`COUNT: ${rows.length}`);
  console.table(rows.map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.gender,
    field: x.direct_match_field,
    score: x.match_score,
    name: x.name,
  })));
}
