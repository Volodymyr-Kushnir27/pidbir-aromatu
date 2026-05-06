require("dotenv").config();

const { findExactNoteMatches } = require("../src/search/exactNoteSearch");
const { getAllPerfumes } = require("../src/search/catalogRepo");

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[`'ʼ’‘"“”«»]/g, " ")
    .replace(/[.,;:!?()[\]{}<>|/\\+=*_~№#@$%^&-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawLike(term) {
  const n = norm(term);
  return getAllPerfumes(5000).filter((row) => {
    const notes = ` ${norm(row.notes)} `;
    return notes.includes(` ${n} `);
  });
}

const queries = [
  "кавун",
  "аромат з кавуном",
  "підбери аромат кавуну",
  "імбир",
  "імбирь",
  "персик",
  "слива",
  "мед",
  "фіалка",
  "мʼята",
  "шлейфовий парфум з вишнею",
  "парфуми з запахом рому чи віскі",
];

for (const q of queries) {
  const t0 = Date.now();
  const items = findExactNoteMatches(q, { limit: 30 });
  const ms = Date.now() - t0;

  console.log("\n==============================");
  console.log(`QUERY: ${q}`);
  console.log(`TIME: ${ms} ms`);
  console.log(`COUNT: ${items.length}`);

  console.table(items.map((x) => ({
    id: x.id,
    code: x.number_code,
    name: x.name,
    gender: x.gender || x.for_whom,
    match_field: x.direct_match_field,
    why: Array.isArray(x.why_selected) ? x.why_selected.join(" | ") : x.why_selected,
  })));
}

console.log("\nRAW NOTES CHECK:");
for (const term of ["кавун", "імбир", "персик", "слива", "мед", "фіалка"]) {
  const rows = rawLike(term);
  console.log(`\nTERM ${term}: ${rows.length}`);
  console.table(rows.map((x) => ({
    id: x.id,
    code: x.number_code,
    name: x.name,
    notes: String(x.notes || "").slice(0, 120),
  })));
}
