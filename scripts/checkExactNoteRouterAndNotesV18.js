const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'src/index.js');
const flowPath = path.join(root, 'src/flows/exactNoteTelegramFlow.js');
const exactPath = path.join(root, 'src/search/exactNoteSearch.js');

function has(file, s) {
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(s);
}

console.log('index has EXACT_NOTE_ROUTER_V18:', has(indexPath, 'EXACT_NOTE_ROUTER_V18'));
console.log('index imports onExactNoteText:', has(indexPath, 'onExactNoteText'));
console.log('flow exists:', fs.existsSync(flowPath));
console.log('flow calls findExactNoteMatches:', has(flowPath, 'findExactNoteMatches'));
console.log('exact aliases V18:', has(exactPath, 'EXACT_NOTE_ALIASES_V18'));
console.log('exact exports findExactNoteMatches:', has(exactPath, 'findExactNoteMatches'));

let ok = true;
for (const [file, marker] of [[indexPath, 'EXACT_NOTE_ROUTER_V18'], [flowPath, 'onExactNoteText'], [exactPath, 'EXACT_NOTE_ALIASES_V18']]) {
  if (!has(file, marker)) ok = false;
}

if (!ok) {
  console.error('❌ V18 is NOT fully connected. Run node scripts/applyExactNoteRouterAndAliasesV18.js');
  process.exit(1);
}

console.log('✅ V18 exact-note router and aliases are connected.');
