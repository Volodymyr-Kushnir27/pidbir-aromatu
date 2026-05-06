require("dotenv").config();

const { searchByNameAndKeywords, hasStrongDirectMatch } = require("../src/search/directNameKeywordSearch");

const queries = process.argv.slice(2);
const tests = queries.length ? queries : ["імператриця", "крид", "том форд", "пако карабан", "гуд герл"];

for (const q of tests) {
  const start = Date.now();
  const rows = searchByNameAndKeywords(q, { limit: 10, minScore: 1200, scanLimit: 1000 });
  const ms = Date.now() - start;
  console.log("\n===", q, "===");
  console.log("time:", ms, "ms");
  console.log("count:", rows.length);
  console.log("strong:", hasStrongDirectMatch(rows));
  console.table(rows.slice(0, 5).map((x) => ({
    id: x.id,
    code: x.number_code,
    name: x.name,
    field: x.direct_match_field,
    type: x.direct_match_type,
    score: x.match_score,
  })));
}
