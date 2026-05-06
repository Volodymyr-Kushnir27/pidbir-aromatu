require("dotenv").config();
const { searchByNameAndKeywords, hasStrongDirectMatch } = require("../src/search/directNameKeywordSearch");
const { getAllPerfumes } = require("../src/search/catalogRepo");

const queries = ["габа", "gaba", "hormone gaba", "гормон габа", "гормон париж габа"];

for (const query of queries) {
  const t0 = Date.now();
  const rows = searchByNameAndKeywords(query, { limit: 30, minScore: 1200 });
  console.log("\n==============================");
  console.log(`QUERY: ${query}`);
  console.log(`TIME: ${Date.now() - t0} ms`);
  console.log(`COUNT: ${rows.length}`);
  console.log(`STRONG: ${hasStrongDirectMatch(rows)}`);
  console.table(rows.map((x) => ({
    id: x.id,
    code: x.number_code,
    field: x.direct_match_field,
    type: x.direct_match_type,
    score: x.match_score,
    name: x.name,
    version: String(x.version || "").slice(0, 90),
  })));
}

console.log("\nRaw DB rows containing gaba/габа:");
const all = getAllPerfumes(2000).filter((x) => String([
  x.name, x.version, x.keywords, x.notes, x.description,
].join(" | ")).toLowerCase().includes("gaba") || String([
  x.name, x.version, x.keywords, x.notes, x.description,
].join(" | ")).toLowerCase().includes("габа"));
console.table(all.map((x) => ({ id: x.id, code: x.number_code, name: x.name, version: String(x.version || "").slice(0, 100) })));
