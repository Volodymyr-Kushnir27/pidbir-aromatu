require('dotenv').config();

const { searchByNameAndKeywords } = require('../src/search/directNameKeywordSearch');

const queries = [
  'Аромат з кавуном',
  'підбери аромат кавуну',
  'з нотою кавуна',
  'аромат з персиком',
  'Tom Ford Bitter Peach',
  'том форд персик',
  'крид',
  'жіночі імператриця'
];

for (const q of queries) {
  const t0 = Date.now();
  const rows = searchByNameAndKeywords(q, { limit: 10, minScore: 1200, scanLimit: 300 });
  const ms = Date.now() - t0;
  console.log('\n---', q, '---');
  console.log('time:', ms, 'ms', 'count:', rows.length);
  console.table(rows.slice(0, 5).map(x => ({ id: x.id, code: x.number_code, name: x.name, field: x.direct_match_field, type: x.direct_match_type, score: x.match_score })));
}
