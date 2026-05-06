require("dotenv").config();

const {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
  cleanDirectQuery,
  applyCommonAliases,
} = require("../src/search/directNameKeywordSearch");

const queries = [
  "пакорабан",
  "пакорабана",
  "пако рабан",
  "пако рабана",
  "pako raban",
  "paco raban",
  "paco rabanne",
  "рабан",
  "том іорд",
  "том форд",
];

for (const q of queries) {
  const t0 = Date.now();
  const results = searchByNameAndKeywords(q, {
    limit: 30,
    minScore: 1200,
    scanLimit: 1000,
  });
  const ms = Date.now() - t0;

  console.log("\n==============================");
  console.log("QUERY:", q);
  console.log("CLEAN:", typeof cleanDirectQuery === "function" ? cleanDirectQuery(q) : "-");
  console.log("ALIASED:", typeof applyCommonAliases === "function" ? applyCommonAliases(q) : "-");
  console.log("TIME:", `${ms} ms`);
  console.log("COUNT:", results.length);
  console.log("STRONG:", hasStrongDirectMatch(results));

  console.table(
    results.slice(0, 12).map((item) => ({
      id: item.id,
      code: item.number_code,
      gender: item.gender,
      field: item.direct_match_field,
      type: item.direct_match_type,
      score: item.match_score,
      name: item.name,
      version: item.version,
    }))
  );
}
