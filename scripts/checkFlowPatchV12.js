const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/flows/perfumeChatFlow.js');
const s = fs.readFileSync(file, 'utf8');
const checks = [
  ['import findExactNoteMatches', 'findExactNoteMatches'],
  ['helper handleExactNoteQueryEarlyV12', 'handleExactNoteQueryEarlyV12'],
  ['call before direct/AI', 'V12_EXACT_NOTE_BEFORE_DIRECT_AND_AI'],
  ['direct bypass', 'V12_EXACT_NOTE_DIRECT_BYPASS'],
];
let ok = true;
for (const [name, token] of checks) {
  const has = s.includes(token);
  console.log(`${has ? '✅' : '❌'} ${name}`);
  if (!has) ok = false;
}
if (!ok) process.exit(1);
