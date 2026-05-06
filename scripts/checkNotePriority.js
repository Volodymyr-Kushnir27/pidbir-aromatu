require("dotenv").config();

const { findCandidates } = require("../src/search/candidateSearch");

const cases = [
  {
    title: "кавун exact note",
    profile: {
      gender: "unknown",
      notes_include: ["кавун"],
      notes_prefer: ["кавун"],
      raw_terms: ["кавун"],
      accords: ["фруктовий", "літній"],
      style_tags: ["фруктовий", "літній"],
    },
  },
  {
    title: "lemon pie external reference",
    profile: {
      gender: "female",
      notes_include: ["lemon", "vanilla", "cream", "sugar", "biscuit"],
      notes_prefer: ["lemon", "vanilla"],
      raw_terms: ["Sabrina Carpenter Lemon Pie", "lemon", "vanilla", "cream", "sugar", "biscuit", "gourmand"],
      accords: ["sweet", "gourmand", "citrus"],
      style_tags: ["sweet", "gourmand", "dessert"],
      season: ["spring", "summer"],
    },
  },
];

for (const item of cases) {
  const t0 = Date.now();
  const rows = findCandidates(item.profile, 30);
  const ms = Date.now() - t0;

  console.log("\n==============================");
  console.log(item.title);
  console.log("time:", ms, "ms");
  console.log("count:", rows.length);

  console.table(
    rows.slice(0, 10).map((x) => ({
      id: x.id,
      code: x.number_code,
      name: x.name,
      gender: x.gender,
      score: x.match_score,
      exact: x._debug?.matched_exact_notes?.join(", "),
      notes: x._debug?.matched_notes?.slice(0, 4).join(", "),
      unisex: x._debug?.unisexPriority,
    })),
  );
}
