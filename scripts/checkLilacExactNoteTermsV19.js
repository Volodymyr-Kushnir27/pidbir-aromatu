require('dotenv').config();
const { findExactNoteMatches } = require('../src/search/exactNoteSearch');

const queries = [
  'бузок',
  'сирень',
  'аромат з нотою бузку',
  'полуниця',
  'маракуя',
  'базилік',
  'гарбуз',
  'диня',
  'кавун',
  'імбир',
];

for (const q of queries) {
  const res = findExactNoteMatches(q, { limit: 30 });
  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('COUNT:', res.length);
  console.table(res.slice(0, 15).map((x) => ({
    id: x.id,
    code: x.number_code || x.code,
    name: x.name,
    field: x.direct_match_field,
    score: Math.round(Number(x.match_score || 0)),
    why: Array.isArray(x.why_selected) ? x.why_selected.join(' | ') : '',
  })));
}
