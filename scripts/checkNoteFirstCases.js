require('dotenv').config();

const { parseLocalQuery } = require('../src/search/queryNormalizer');
const { searchByNameAndKeywords } = require('../src/search/directNameKeywordSearch');
const { findExactNoteMatches } = require('../src/search/exactNoteSearch');

const queries = [
  'шлейфовий парфум з вишнею',
  'аромат з вишнею',
  'вишнею',
  'підбери аромат кавуну',
  'аромат з кавуном',
  'жасмин',
  'аромат з жасмином',
  'персик',
  'перець',
  'амбра',
];

for (const q of queries) {
  const local = parseLocalQuery(q);
  const t0 = Date.now();
  const exact = findExactNoteMatches(q, { limit: 30 });
  const exactMs = Date.now() - t0;

  const d0 = Date.now();
  const direct = searchByNameAndKeywords(q, { limit: 5 });
  const directMs = Date.now() - d0;

  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('LOCAL:', local);
  console.log('EXACT NOTE:', { ms: exactMs, count: exact.length, ids: exact.map(x => x.id) });
  console.table(exact.slice(0, 10).map(x => ({ id: x.id, code: x.number_code, gender: x.gender, score: x.match_score, name: x.name, why: (x.why_selected || []).join(' | ') })));
  console.log('DIRECT:', { ms: directMs, count: direct.length, first: direct[0]?.name, field: direct[0]?.direct_match_field, type: direct[0]?.direct_match_type });
}
