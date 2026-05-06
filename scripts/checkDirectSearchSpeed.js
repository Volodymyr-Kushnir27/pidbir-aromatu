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

  "пако рабан",
  "чоловічі пако рабан",
  "пако карабан",
  "чоловічі пако карабан",

  "чоловічі інвіктус",
  "жіночі дольче габана",
  "покажи жіночі дольче габана",
  "підбери чоловічі tom ford",
];

let failed = false;

for (const query of queries) {
  const t0 = Date.now();

  const results = searchByNameAndKeywords(query, {
    limit: 10,
    minScore: 1200,
    scanLimit: 1000,
  });

  const ms = Date.now() - t0;
  const strong = hasStrongDirectMatch(results);

  if (ms > 1000) failed = true;

  console.log("\n==============================");
  console.log(`QUERY: ${query}`);
  console.log(`CLEAN: ${cleanDirectQuery(query)}`);
  console.log(`GENDER: ${detectGenderFromQuery(query) || "-"}`);
  console.log(`TIME: ${ms} ms`);
  console.log(`COUNT: ${results.length}`);
  console.log(`STRONG: ${strong}`);

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

if (failed) {
  console.error("\n❌ Є запити > 1000 ms. Direct-search все ще повільний або Render запустив старий код.");
  process.exitCode = 1;
} else {
  console.log("\n✅ Усі direct-search запити виконались швидко.");
}
