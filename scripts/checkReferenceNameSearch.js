require("dotenv").config();

const {
  findReferenceNameMatches,
  buildReferenceNameQueries,
  hasStrongReferenceNameMatch,
} = require("../src/search/referenceNameSearch");

const cases = [
  {
    text: "імператриця жіночі",
    analysis: {
      query_type: "reference_perfume",
      target_name: "Імператриця",
      brand: "Dolce Gabbana",
      possible_names: ["L'imperatrice", "Imperatrice", "Dolce Gabbana Imperatrice"],
      gender: "female",
    },
  },
  {
    text: "Sabrina Carpenter Lemon Pie підбери щось схоже",
    analysis: {
      query_type: "reference_perfume",
      target_name: "Sweet Tooth Lemon Pie",
      brand: "Sabrina Carpenter",
      possible_names: ["Sabrina Carpenter Sweet Tooth Lemon Pie", "Lemon Pie"],
      gender: "female",
    },
  },
];

for (const c of cases) {
  const queries = buildReferenceNameQueries(c.text, c.analysis, {});
  const rows = findReferenceNameMatches(c.text, c.analysis, {}, { limit: 30 });

  console.log("\n==============================");
  console.log(c.text);
  console.log("queries:", queries);
  console.log("count:", rows.length);
  console.log("strong:", hasStrongReferenceNameMatch(rows));

  console.table(
    rows.slice(0, 10).map((x) => ({
      id: x.id,
      code: x.number_code,
      name: x.name,
      gender: x.gender,
      score: x.match_score,
      field: x.direct_match_field,
      type: x.direct_match_type,
    })),
  );
}
