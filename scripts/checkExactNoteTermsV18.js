require('dotenv').config();
const { findExactNoteMatches } = require('../src/search/exactNoteSearch');

const queries = [
  'кавун',
  'диня',
  'полуниця',
  'полуницею',
  'маракуя',
  'маракуї',
  'базилік',
  'базиліку',
  'гарбуз',
  'імбир',
  'шлейфовий парфум з вишнею',
];

for (const q of queries) {
  const rows = findExactNoteMatches(q, { limit: 30 });
  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('COUNT:', rows.length);
  console.table(rows.map((x) => ({
    id: x.id,
    code: x.number_code || x.code,
    gender: x.gender || x.for_whom,
    name: x.name,
    why: Array.isArray(x.why_selected) ? x.why_selected.join(' | ') : '',
  })));
}
