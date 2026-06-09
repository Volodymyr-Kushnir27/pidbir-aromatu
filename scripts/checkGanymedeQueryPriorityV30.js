const fs = require("fs");
const path = require("path");

const FILE = path.resolve("src/search/directNameKeywordSearch.js");

if (!fs.existsSync(FILE)) {
  console.error(`❌ File not found: ${FILE}`);
  process.exit(1);
}

const src = fs.readFileSync(FILE, "utf8");

const required = [
  "V30_GANYMEDE_PRIORITY_STOP_WORDS",
  "V30_GANYMEDE_ALIASES",
  "V30_EXACT_CANONICAL_QUERY_TERMS",
  '"номер"',
  '"аромата"',
  '["ганимед", "ganymede"]',
  '["ганнимед", "ganymede"]',
  '["ганиммед", "ganymede"]'
];

const missing = required.filter((x) => !src.includes(x));

if (missing.length) {
  console.error("❌ Missing V30 patches:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("✅ V30 direct search patch installed.");
console.log("Expected behavior:");
console.log('- "Ганнимед" -> Ganymede');
console.log('- "Номер аромата ганимед" -> Ganymede first, not Victoria Secret / random results');
