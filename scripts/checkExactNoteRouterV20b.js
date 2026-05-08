const fs = require('fs');
const path = require('path');

const indexFile = path.join(process.cwd(), 'src', 'index.js');
const flowFile = path.join(process.cwd(), 'src', 'flows', 'exactNoteTelegramFlow.js');
const searchFile = path.join(process.cwd(), 'src', 'search', 'exactNoteSearch.js');

function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
const index = read(indexFile);
const flow = read(flowFile);
const search = read(searchFile);

const checks = [
  ['index has require onExactNoteText', /onExactNoteText/.test(index) && /require\(["']\.\/flows\/exactNoteTelegramFlow["']\)/.test(index)],
  ['index has V20B router marker', index.includes('EXACT_NOTE_ROUTER_V20B')],
  ['index has exactly one const handledExactNote', (index.match(/const handledExactNote = await onExactNoteText\(ctx\);/g) || []).length === 1],
  ['index has exact router before onUserText', index.indexOf('handledExactNote') !== -1 && index.indexOf('handledExactNote') < index.indexOf('onUserText(ctx)')],
  ['flow exports onExactNoteText', /module\.exports\s*=\s*\{\s*onExactNoteText\s*\}/.test(flow) || /exports\.onExactNoteText/.test(flow)],
  ['exact search exports findExactNoteMatches', /findExactNoteMatches/.test(search) && /module\.exports/.test(search)],
  ['exact search has V20 aliases', search.includes('EXACT_NOTE_ALIASES_V20')],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

process.exit(ok ? 0 : 1);
