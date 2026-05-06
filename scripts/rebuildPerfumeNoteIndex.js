require("dotenv").config();
const path = require("path");
const Database = require("better-sqlite3");
const { NOTE_DICTIONARY, containsPhrase } = require("../src/search/noteDictionary");

const dbPath = process.env.CATALOG_DB_PATH || process.env.DB_PATH || path.join(process.cwd(), "data", "perfumes.sqlite");
console.log("DB PATH:", dbPath);
const db = new Database(dbPath);

db.exec(`
DROP TABLE IF EXISTS perfume_note_index;
CREATE TABLE perfume_note_index (
  perfume_id INTEGER NOT NULL,
  canonical_note TEXT NOT NULL,
  matched_term TEXT NOT NULL,
  source_field TEXT NOT NULL,
  PRIMARY KEY (perfume_id, canonical_note, matched_term, source_field)
);
CREATE INDEX IF NOT EXISTS idx_perfume_note_index_note ON perfume_note_index(canonical_note);
CREATE INDEX IF NOT EXISTS idx_perfume_note_index_perfume ON perfume_note_index(perfume_id);
`);

const rows = db.prepare("SELECT id, name, version, notes, keywords FROM perfumes").all();
const insert = db.prepare(`INSERT OR IGNORE INTO perfume_note_index
  (perfume_id, canonical_note, matched_term, source_field)
  VALUES (?, ?, ?, ?)`);

const fields = ["notes", "keywords", "version", "name"];
const tx = db.transaction(() => {
  for (const row of rows) {
    for (const [canonical, terms] of Object.entries(NOTE_DICTIONARY)) {
      for (const field of fields) {
        const text = row[field] || "";
        for (const term of terms || []) {
          if (containsPhrase(text, term)) {
            insert.run(row.id, canonical, term, field);
          }
        }
      }
    }
  }
});

tx();
console.log("perfumes:", rows.length);
console.log("note index rows:", db.prepare("SELECT COUNT(*) AS count FROM perfume_note_index").get().count);
console.table(db.prepare(`
SELECT canonical_note, COUNT(DISTINCT perfume_id) AS perfumes
FROM perfume_note_index
GROUP BY canonical_note
ORDER BY perfumes DESC, canonical_note ASC
LIMIT 30
`).all());
