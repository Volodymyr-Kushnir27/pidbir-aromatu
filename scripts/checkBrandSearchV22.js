require('dotenv').config();

const { searchByNameAndKeywords } = require('../src/search/directNameKeywordSearch');

const cases = [
  'армані',
  'армани',
  'armani',
  'чоловічі армані',
  'чоловічі armani',
  'джо ма лонг',
  'jo malone',
  'зелінскі',
  'зелински',
  'zielinski',
  'чоловічі шанель',
  'шанель чоловічі',
];

for (const q of cases) {
  const rows = searchByNameAndKeywords(q, { limit: 10, scanLimit: 2000 });
  console.log('\nQUERY:', q);
  console.log('FOUND:', rows.length);
  for (const r of rows.slice(0, 10)) {
    console.log(`- ${r.number_code || ''} | ${r.gender || ''} | ${r.name || ''} | score=${r.match_score} | field=${r.direct_match_field}`);
  }
}
