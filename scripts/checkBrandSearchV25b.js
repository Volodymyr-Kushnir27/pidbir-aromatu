process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "local-test-key";
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "local-test-token";

const { searchByNameAndKeywords } = require("../src/search/directNameKeywordSearch");

const queries = [
  "армані",
  "армани",
  "armani",
  "джо ма лонг",
  "джо малон",
  "jo malone",
  "зелінскі",
  "зелински",
  "zielinski",
  "ескада",
  "чоловічі шанель",
  "шанель чоловічі",
];

for (const q of queries) {
  const rows = searchByNameAndKeywords(q, { limit: 10, scanLimit: 1000 });
  console.log("\n==============================");
  console.log("QUERY:", q, "COUNT:", rows.length);
  console.table(rows.map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.for_whom,
    name: x.name,
    field: x.direct_match_field,
    type: x.direct_match_type,
    score: x.match_score,
  })));
}
