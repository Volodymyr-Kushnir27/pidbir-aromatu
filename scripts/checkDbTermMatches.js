require("dotenv").config();
const { getAllPerfumes } = require("../src/search/catalogRepo");

const terms = process.argv.slice(2);
if (!terms.length) {
  terms.push("кавун", "watermelon", "арбуз", "gaba", "габа");
}

function norm(value) {
  return String(value || "").toLowerCase().replace(/[ʼ’‘`´']/g, " ").replace(/\s+/g, " ").trim();
}

const rows = getAllPerfumes(2000);
for (const term of terms) {
  const t = norm(term);
  const found = rows.filter((row) => norm([
    row.id,
    row.number_code,
    row.name,
    row.version,
    row.keywords,
    row.notes,
    row.description,
  ].join(" | ")).includes(t));

  console.log("\n==============================");
  console.log(`TERM: ${term}`);
  console.log(`COUNT: ${found.length}`);
  console.table(found.map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.gender,
    name: x.name,
    version: String(x.version || "").slice(0, 80),
    notes: String(x.notes || "").slice(0, 120),
  })));
}
