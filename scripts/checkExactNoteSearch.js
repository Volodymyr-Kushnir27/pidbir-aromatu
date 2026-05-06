require("dotenv").config();

const { findExactNoteMatches } = require("../src/search/exactNoteSearch");
const { findCandidates } = require("../src/search/candidateSearch");

const cases = [
  { text: "підбери аромат кавуну", gender: null },
  { text: "жіночий аромат кавуну", gender: "female" },
  { text: "унісекс аромат кавуну", gender: "unisex" },
  { text: "лимон ваніль бісквіт", gender: "female" },
];

for (const c of cases) {
  console.log("\n==============================");
  console.log("EXACT NOTE:", c.text, "gender:", c.gender || "-");
  const rows = findExactNoteMatches(c.text, { gender: c.gender, limit: 30 });
  console.log("count:", rows.length);
  console.table(rows.map((x) => ({
    id: x.id,
    code: x.number_code,
    name: x.name,
    gender: x.gender,
    score: x.match_score,
    why: (x.why_selected || []).join("; "),
  })));
}

const profile = {
  gender: "unknown",
  notes_include: ["кавун"],
  notes_prefer: ["кавун"],
  raw_terms: ["кавун", "фруктовий", "літній"],
  accords: ["фруктовий", "свіжий", "літній"],
  style_tags: ["фруктовий", "свіжий", "літній"],
};

console.log("\n==============================");
console.log("CANDIDATES PROFILE: кавун");
const candidates = findCandidates(profile, 30);
console.log("count:", candidates.length);
console.table(candidates.map((x) => ({
  id: x.id,
  code: x.number_code,
  name: x.name,
  gender: x.gender,
  score: x.match_score,
  exact: x._debug?.matched_exact_notes?.join(", "),
  fallback: x._debug?.matched_note_fallbacks?.join(", "),
})));
