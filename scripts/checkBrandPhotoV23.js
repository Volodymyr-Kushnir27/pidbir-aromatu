const { searchByNameAndKeywords } = require('../src/search/directNameKeywordSearch');
const db = require('../src/db/catalogDb');

const queries = [
  'армані', 'армани', 'armani',
  'джо ма лонг', 'jo malone',
  'зелінскі', 'зелински', 'zielinski',
  'чоловічі шанель', 'шанель чоловічі',
];

for (const q of queries) {
  const rows = searchByNameAndKeywords(q, { limit: 10, scanLimit: 1000 });
  console.log('\nQUERY:', q, 'COUNT:', rows.length);
  console.table(rows.map((r) => ({ code: r.number_code, gender: r.gender, name: r.name, field: r.direct_match_field, type: r.direct_match_type, score: r.match_score })));
}

function normalizeCode(input) {
  return String(input || '').toUpperCase().replace(/А/g, 'A').replace(/Е/g, 'E').replace(/С/g, 'C').replace(/О/g, 'O').replace(/Р/g, 'P').replace(/Х/g, 'X').replace(/\s+/g, '');
}

console.log('\nPHOTOS:');
const all = db.prepare('SELECT id, number_code, name, photo FROM perfumes').all();
for (const code of ['155A', '61A', '208A']) {
  const row = all.find((r) => normalizeCode(r.number_code) === code);
  console.log(row);
}
