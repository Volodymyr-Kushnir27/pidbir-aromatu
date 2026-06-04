const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.CATALOG_DB_PATH || './data/perfumes.sqlite';
const ABS_DB_PATH = path.resolve(DB_PATH);

if (!fs.existsSync(ABS_DB_PATH)) {
  console.error(`DB not found: ${ABS_DB_PATH}`);
  process.exit(1);
}

const db = new Database(ABS_DB_PATH, { readonly: true });
const codes = ['640A', '417A', '626A', '32E'];

const rows = db.prepare(`
  SELECT id, number_code, name, for_whom, type, season, photo
  FROM perfumes
  WHERE number_code IN (${codes.map(() => '?').join(', ')})
  ORDER BY id
`).all(...codes);

console.log(`Found ${rows.length} perfumes:`);
console.table(rows);

console.log('\nDetailed preview:');
const detailed = db.prepare(`
  SELECT id, number_code, name, number_codes, notes, keywords, version
  FROM perfumes
  WHERE number_code IN (${codes.map(() => '?').join(', ')})
  ORDER BY id
`).all(...codes);

for (const row of detailed) {
  console.log('\n----------------------------------------');
  console.log(`ID: ${row.id}`);
  console.log(`CODE: ${row.number_code}`);
  console.log(`NAME: ${row.name}`);
  console.log(`ALT CODES: ${row.number_codes}`);
  console.log(`NOTES:\n${row.notes}`);
  console.log(`KEYWORDS:\n${row.keywords}`);
  console.log(`VERSION:\n${row.version}`);
}
