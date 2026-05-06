const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/search/noteDictionary.js');
if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');
const backup = `${file}.bak_note_boundary_v10_${Date.now()}`;
fs.writeFileSync(backup, s);
console.log('backup:', backup);

const normalizeFn = `function normalizePhrase(value) {\n  return String(value || \"\")\n    .toLowerCase()\n    .replace(/ё/g, \"е\")\n    .replace(/ґ/g, \"г\")\n    .replace(/[ʼ’‘\`´]/g, \"'\")\n    .replace(/&/g, \" and \")\n    // Дуже важливо: коми, крапки, двокрапки, перенос рядка тощо мають бути межами слів.\n    // Інакше \"Кавун,\" не знаходиться по запиту \"кавун\", а \"ром\" може плутатись з \"ромашка\".\n    .replace(/[^0-9a-zа-яіїє'\\-]+/gi, \" \")\n    .replace(/[ʼ’‘\`´']/g, \" \")\n    .replace(/-/g, \" \")\n    .replace(/\\s+/g, \" \")\n    .trim();\n}`;

const containsFn = `function containsPhrase(haystack, phrase) {\n  const normalizedNeedle = normalizePhrase(phrase);\n  if (!normalizedNeedle) return false;\n\n  const h = \` \${normalizePhrase(haystack)} \`;\n  const p = \` \${normalizedNeedle} \`;\n\n  // Пошук тільки по межах слів: \"ром\" не матчить \"ромашка\",\n  // але \"Кавун,\" / \"Кавун\\n\" / \"Вишня,Кавун\" матчиться правильно.\n  return h.includes(p);\n}`;

function replaceFunction(source, fnName, replacement) {
  const re = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm');
  if (!re.test(source)) {
    console.error(`Cannot find function ${fnName} in noteDictionary.js`);
    process.exit(1);
  }
  return source.replace(re, replacement);
}

s = replaceFunction(s, 'normalizePhrase', normalizeFn);
s = replaceFunction(s, 'containsPhrase', containsFn);

fs.writeFileSync(file, s);
console.log('patched:', file);
console.log('Now run: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkWatermelonBoundaryV10.js');
