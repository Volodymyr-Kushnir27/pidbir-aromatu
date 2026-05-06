require('dotenv').config();

const { parseLocalQuery } = require('../src/search/queryNormalizer');
const { findExactNoteMatches } = require('../src/search/exactNoteSearch');
const { getDbPath } = require('../src/search/catalogRepo');

const queries = ['кавун', 'аромат з кавуном', 'диня', 'парфуми з нотою дині', 'імбир', 'имбирь', 'шлейфовий парфум з вишнею'];

console.log('DB PATH:', getDbPath ? getDbPath() : process.env.CATALOG_DB_PATH);

for (const q of queries) {
  const parsed = parseLocalQuery(q);
  const rows = findExactNoteMatches(q, { limit: 30 });
  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('explicitNotes:', parsed.explicitNotes);
  console.log('isExplicitNoteQuery:', parsed.isExplicitNoteQuery);
  console.log('COUNT:', rows.length);
  console.table(rows.map((r) => ({ id: r.id, code: r.number_code, gender: r.gender, name: r.name, score: r.match_score })));
}
