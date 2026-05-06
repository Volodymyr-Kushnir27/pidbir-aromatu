const fs = require('fs');
const path = require('path');

const flowPath = path.join(process.cwd(), 'src', 'flows', 'perfumeChatFlow.js');
const exactPath = path.join(process.cwd(), 'src', 'search', 'exactNoteSearch.js');

const flow = fs.existsSync(flowPath) ? fs.readFileSync(flowPath, 'utf8') : '';
const exact = fs.existsSync(exactPath) ? fs.readFileSync(exactPath, 'utf8') : '';

console.log('flow has wrapper V15:', flow.includes('EXACT_NOTE_RUNTIME_WRAPPER_V15'));
console.log('flow calls findExactNoteMatches:', flow.includes('findExactNoteMatches'));
console.log('exactNoteSearch exports findExactNoteMatches:', exact.includes('findExactNoteMatches'));

if (!flow.includes('EXACT_NOTE_RUNTIME_WRAPPER_V15') || !flow.includes('findExactNoteMatches')) {
  console.error('❌ Wrapper is NOT connected to perfumeChatFlow.js');
  process.exit(1);
}

console.log('✅ Wrapper is connected. Commit, push, deploy, then Manual Restart Render.');
