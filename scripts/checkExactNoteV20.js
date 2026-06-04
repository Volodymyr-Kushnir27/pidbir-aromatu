require('dotenv').config();
const { findExactNoteMatches } = require('../src/search/exactNoteSearch');
const fs = require('fs');

const tests = ['бузок', 'сирень', 'зелений бузок', 'полуниця', 'маракуя', 'базилік', 'гарбуз', 'диня', 'кавун', 'імбир'];

for (const q of tests) {
  const rows = findExactNoteMatches(q, { limit: 30 });
  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('COUNT:', rows.length);
  console.table(rows.slice(0, 30).map(r => ({
    code: r.number_code || r.code,
    name: r.name,
    field: r.direct_match_field,
    why: Array.isArray(r.why_selected) ? r.why_selected.join('; ') : r.why_selected,
  })));
}

console.log('\nRouter markers:');
const index = fs.existsSync('src/index.js') ? fs.readFileSync('src/index.js', 'utf8') : '';
const exact = fs.existsSync('src/search/exactNoteSearch.js') ? fs.readFileSync('src/search/exactNoteSearch.js', 'utf8') : '';
console.log('index has EXACT_NOTE_ROUTER_V20:', index.includes('EXACT_NOTE_ROUTER_V20'));
console.log('index has onExactNoteText:', index.includes('onExactNoteText'));
console.log('exact has EXACT_NOTE_ALIASES_V20:', exact.includes('EXACT_NOTE_ALIASES_V20'));
