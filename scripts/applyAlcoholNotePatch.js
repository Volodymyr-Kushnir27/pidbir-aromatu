const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "src/search/noteDictionary.js");

if (!fs.existsSync(file)) {
  console.error("Missing src/search/noteDictionary.js");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
const backup = `${file}.bak_alcohol_${Date.now()}`;
fs.writeFileSync(backup, s);

const marker = "const CURATED_NOTE_GROUPS = {";
if (!s.includes(marker)) {
  console.error("Cannot find CURATED_NOTE_GROUPS in src/search/noteDictionary.js");
  process.exit(1);
}

const alcoholBlock = `
  "rum": [
    "ром",
    "рому",
    "ромом",
    "ромовий",
    "rum",
    "boozy",
    "алкогольний",
    "алкогольні ноти"
  ],
  "whiskey": [
    "віскі",
    "виски",
    "виски",
    "whisky",
    "whiskey",
    "bourbon",
    "бурбон",
    "скотч",
    "scotch",
    "boozy",
    "алкогольний",
    "алкогольні ноти"
  ],
  "cognac": [
    "коньяк",
    "коньяку",
    "коньяком",
    "cognac",
    "brandy",
    "бренді",
    "бренди",
    "boozy",
    "алкогольний"
  ],
  "liqueur": [
    "лікер",
    "лікеру",
    "лікером",
    "ликер",
    "liqueur",
    "liquor",
    "boozy",
    "алкогольний"
  ],
  "vodka": [
    "горілка",
    "горілки",
    "горілкою",
    "водка",
    "vodka",
    "boozy",
    "алкогольний"
  ],
  "wine": [
    "вино",
    "вина",
    "вином",
    "червоне вино",
    "wine",
    "red wine",
    "boozy",
    "алкогольний"
  ],
  "champagne": [
    "шампанське",
    "шампанського",
    "шампанським",
    "champagne",
    "sparkling wine",
    "boozy",
    "алкогольний"
  ],
`;

if (!s.includes('"rum":') && !s.includes('"whiskey":')) {
  s = s.replace(marker, `${marker}\n${alcoholBlock}`);
} else {
  console.log("Alcohol groups already seem to exist; skipping insertion.");
}

// Fix common issue: якщо NOTE_REQUEST_WORDS не має "запахом"/"аромати"/"парфуми",
// запит може піти в direct keywords. Додаємо у queryNormalizer.js нижче.
fs.writeFileSync(file, s);

const qFile = path.join(process.cwd(), "src/search/queryNormalizer.js");
if (fs.existsSync(qFile)) {
  let q = fs.readFileSync(qFile, "utf8");
  const qBackup = `${qFile}.bak_alcohol_${Date.now()}`;
  fs.writeFileSync(qBackup, q);

  const words = [
    "запах", "запахом", "запаху", "аромати", "парфюми",
    "пахне", "пахнуть", "ноту", "відтінок", "відтінком",
    "акорд", "акордом", "акорди", "boozy"
  ];

  for (const w of words) {
    if (!q.includes(`"${w}"`)) {
      q = q.replace("const NOTE_REQUEST_WORDS = new Set([", `const NOTE_REQUEST_WORDS = new Set([\n  "${w}",`);
    }
  }

  fs.writeFileSync(qFile, q);
  console.log("patched: src/search/queryNormalizer.js");
}

console.log("backup:", backup);
console.log("patched: src/search/noteDictionary.js");
console.log("Done. Run: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkAlcoholNoteSearch.js");
