const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'src/index.js');
const exactPath = path.join(ROOT, 'src/search/exactNoteSearch.js');
const flowPath = path.join(ROOT, 'src/flows/exactNoteTelegramFlow.js');

function has(file, s) {
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(s);
}

const checks = [
  ['index has onExactNoteText require', has(indexPath, 'onExactNoteText')],
  ['index has V19 router marker', has(indexPath, 'EXACT_NOTE_ROUTER_V19_BEFORE_AI')],
  ['flow file exists', fs.existsSync(flowPath)],
  ['flow exports onExactNoteText', has(flowPath, 'onExactNoteText')],
  ['exact search has V19 aliases', has(exactPath, 'EXACT_NOTE_ALIASES_V19_LILAC_AND_MISSING_FRUITS')],
  ['exact search exports findExactNoteMatches', has(exactPath, 'findExactNoteMatches')],
];

for (const [name, ok] of checks) {
  console.log((ok ? '✅' : '❌') + ' ' + name);
}

if (checks.every(([, ok]) => ok)) {
  console.log('\n✅ V19 connected. Test notes with: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkLilacExactNoteTermsV19.js');
} else {
  process.exitCode = 1;
}
