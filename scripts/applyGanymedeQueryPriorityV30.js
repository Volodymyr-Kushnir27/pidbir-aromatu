const fs = require("fs");
const path = require("path");

const FILE = path.resolve("src/search/directNameKeywordSearch.js");

if (!fs.existsSync(FILE)) {
  console.error(`❌ File not found: ${FILE}`);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const backup = `${FILE}.bak_v30_ganymede_priority_${Date.now()}`;
fs.copyFileSync(FILE, backup);

function fail(message) {
  console.error(`❌ ${message}`);
  console.error(`Backup: ${backup}`);
  process.exit(1);
}

if (!src.includes("V30_GANYMEDE_PRIORITY_STOP_WORDS")) {
  const marker = '"мене", "себе", "будь", "ласка", "будьласка",';
  if (!src.includes(marker)) {
    fail("Не знайшов місце для INTENT_STOP_WORDS. Треба вручну додати стоп-слова.");
  }

  src = src.replace(
    marker,
    `${marker}
  // V30_GANYMEDE_PRIORITY_STOP_WORDS: прибираємо службові слова, щоб "номер аромата ганимед"
  // не шукав усі рядки через слово "аромата/аромату", а залишав тільки саму назву.
  "номер", "номера", "номеру", "номером", "номери", "номеров", "number",
  "аромата", "аромате", "ароматів", "ароматов", "ароматний", "ароматна", "ароматное",`
  );
}

if (!src.includes("V30_GANYMEDE_ALIASES")) {
  const marker = '["габа", "gaba"], ["hormone paris", "hormone paris"], ["гормон париж", "hormone paris"], ["хормон париж", "hormone paris"],';
  if (!src.includes(marker)) {
    fail("Не знайшов місце для aliases. Треба вручну додати aliases у getAliases().");
  }

  src = src.replace(
    marker,
    `${marker}

    // V30_GANYMEDE_ALIASES: усі варіанти продавця ведемо до canonical "ganymede".
    ["ганімед", "ganymede"], ["ганимед", "ganymede"], ["ганнимед", "ganymede"], ["ганиммед", "ganymede"],
    ["номер ганімед", "ganymede"], ["номер ганимед", "ganymede"], ["номер ганнимед", "ganymede"], ["номер ганиммед", "ganymede"],
    ["номер аромата ганімед", "ganymede"], ["номер аромата ганимед", "ganymede"],
    ["номер аромату ганімед", "ganymede"], ["номер аромату ганимед", "ganymede"],
    ["ganymede", "ganymede"], ["marc antoine barrois ganymede", "marc antoine barrois ganymede"],`
  );
}

// Додаткова гарантія: якщо у запиті після чистки лишилось тільки ganymede,
// то scoring не повинен підтягувати випадкові рядки по службових словах.
if (!src.includes("V30_EXACT_CANONICAL_QUERY_TERMS")) {
  const oldLine = 'const terms = unique([strictBrand, cleaned, aliased, ...tokenize(cleaned), ...tokenize(aliased)]).filter((x) => x && x.length >= 2);';
  const newLine = `// V30_EXACT_CANONICAL_QUERY_TERMS:
  // Якщо aliases звели запит до одного canonical token, наприклад:
  // "номер аромата ганимед" -> "ganymede",
  // не додаємо назад зайві службові частини і не роздуваємо результати.
  const baseTerms = unique([strictBrand, cleaned, aliased, ...tokenize(cleaned), ...tokenize(aliased)]);
  const terms = baseTerms.filter((x) => x && x.length >= 2 && !isNoiseToken(x));`;

  if (!src.includes(oldLine)) {
    fail("Не знайшов рядок buildPrefilterTerms для заміни.");
  }

  src = src.replace(oldLine, newLine);
}

fs.writeFileSync(FILE, src, "utf8");

const occurrences = (src.match(/V30_GANYMEDE/g) || []).length;
const hasStop = src.includes('"номер"') && src.includes('"аромата"');
const hasAliases = src.includes('["ганимед", "ganymede"]') && src.includes('["ганнимед", "ganymede"]');

console.log(`✅ patched: ${FILE}`);
console.log(`backup: ${backup}`);
console.log(`V30 markers: ${occurrences}`);
console.log(`stop words OK: ${hasStop}`);
console.log(`aliases OK: ${hasAliases}`);

if (!hasStop || !hasAliases) {
  process.exit(1);
}
