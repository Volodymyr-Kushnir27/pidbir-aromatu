require("dotenv").config();
const { getAllPerfumes } = require("../src/search/catalogRepo");
const { norm, containsPhrase } = require("../src/search/queryNormalizer");

const terms = process.argv.slice(2);
if (!terms.length) {
  console.error("Usage: node scripts/checkDbTermMatches.js кавун жасмин амбра ...");
  process.exit(1);
}

const rows = getAllPerfumes(5000);
for (const term of terms) {
  const hits = rows.filter((row) => {
    const text = norm([row.name, row.version, row.keywords, row.notes, row.description].filter(Boolean).join(" | "));
    return containsPhrase(text, term);
  });
  console.log("\n==============================");
  console.log("TERM:", term);
  console.log("COUNT:", hits.length);
  console.table(hits.slice(0, 50).map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.gender,
    name: x.name,
    version: String(x.version || "").slice(0, 80),
    notes: String(x.notes || "").slice(0, 130),
  })));
}
