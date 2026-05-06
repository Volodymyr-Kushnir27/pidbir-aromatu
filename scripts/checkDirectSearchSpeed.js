require("dotenv").config();

const {
  searchByNameAndKeywords,
  hasStrongDirectMatch,
  cleanDirectQuery,
  detectGenderFromQuery,
} = require("../src/search/directNameKeywordSearch");

const queries = [
  "імператриця",
  "жіночі імператриця",
  "жіночий імператриця",
  "женские императрица",

  "том форд",
  "чоловічі том форд",
  "чоловічий том форд",
  "мужские том форд",

  "крид",
  "чоловічі крид",
  "унісекс крид",

  "інвіктус",
  "чоловічі інвіктус",
  "мужские инвиктус",

  "дольче габана",
  "жіночі дольче габана",

  "пако рабан",
  "чоловічі пако рабан",
  "пако карабан",
  "чоловічі пако карабан",
];

for (const query of queries) {
  const t0 = Date.now();

  const results = searchByNameAndKeywords(query, {
    limit: 10,
    minScore: 1200,
    scanLimit: 1000,
  });

  const ms = Date.now() - t0;

  console.log("\n==============================");
  console.log(`QUERY: ${query}`);
  console.log(`CLEAN: ${cleanDirectQuery(query)}`);
  console.log(`GENDER: ${detectGenderFromQuery(query) || "-"}`);
  console.log(`TIME: ${ms} ms`);
  console.log(`COUNT: ${results.length}`);
  console.log(`STRONG: ${hasStrongDirectMatch(results)}`);

  console.table(
    results.slice(0, 10).map((item) => ({
      id: item.id,
      code: item.number_code,
      name: item.name,
      gender: item.gender,
      field: item.direct_match_field,
      type: item.direct_match_type,
      score: item.match_score,
    })),
  );
}
