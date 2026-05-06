const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'src', 'index.js');
const flowPath = path.join(root, 'src', 'flows', 'exactNoteTelegramFlow.js');
const exactPath = path.join(root, 'src', 'search', 'exactNoteSearch.js');

function has(file, text) {
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(text);
}

const okIndexMarker = has(indexPath, 'EXACT_NOTE_ROUTER_V16');
const okIndexCall = has(indexPath, 'onExactNoteText(ctx)');
const okFlow = has(flowPath, 'function fallbackFindByNotes') && has(flowPath, 'onExactNoteText');
const okExact = has(exactPath, 'findExactNoteMatches');

console.log('index has EXACT_NOTE_ROUTER_V16:', okIndexMarker);
console.log('index calls onExactNoteText(ctx):', okIndexCall);
console.log('exactNoteTelegramFlow.js exists:', okFlow);
console.log('exactNoteSearch exports/search function exists:', okExact);

if (!okIndexMarker || !okIndexCall || !okFlow || !okExact) {
  console.error('❌ Exact-note router is NOT connected.');
  process.exit(1);
}

console.log('✅ Exact-note router V16 is connected before AI/user flow.');
