require("dotenv").config();

const { searchByNameAndKeywords } = require("../src/search/directNameKeywordSearch");

const queries = [
  "Том Форд",
  "том форд",
  "Пако Рабан",
  "пако рабан",
  "Императрица",
  "Імператриця",
  "погана дівчинка",
  "плохая девочка",
  "Лакоста",
  "Габа",
];

for (const q of queries) {
  const rows = searchByNameAndKeywords(q, {
    limit: 10,
    minScore: 1200,
    scanLimit: 5000,
  });

  console.log("\n==============================");
  console.log("QUERY:", q);
  console.log("FOUND:", rows.length);

  for (const row of rows.slice(0, 5)) {
    console.log({
      id: row.id,
      name: row.name,
      code: row.number_code,
      score: row.match_score,
      field: row.direct_match_field,
      type: row.direct_match_type,
      why: row.why_selected?.[0],
    });
  }
}
