require('dotenv').config();
const { parseLocalQuery } = require('../src/search/queryNormalizer');
const { findExactNoteMatches } = require('../src/search/exactNoteSearch');

const queries = [
  'кавун',
  'Аромат з кавуном',
  'підбери аромат кавуну',
  'з нотою кавуна',
  'слива',
  'мед',
  'фіалка',
  'мʼята',
  'шлейфовий парфум з вишнею',
  'парфуми з запахом рому чи віскі',
];

for (const q of queries) {
  const local = parseLocalQuery(q);
  const t0 = Date.now();
  const rows = findExactNoteMatches(q, { limit: 30, gender: local.gender });
  const ms = Date.now() - t0;
  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('NOTES:', local.explicitNotes);
  console.log('IS_NOTE:', local.isExplicitNoteQuery);
  console.log('TIME:', ms, 'ms');
  console.log('COUNT:', rows.length);
  console.table(rows.map((x) => ({
    id: x.id,
    code: x.number_code,
    gender: x.gender,
    score: Math.round(Number(x.match_score || 0)),
    name: x.name,
    why: (x.why_selected || []).join(' | '),
  })));
}
