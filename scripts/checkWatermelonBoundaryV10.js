require('dotenv').config();

const { findExactNoteMatches } = require('../src/search/exactNoteSearch');
const { containsPhrase, normalizePhrase, detectNotesInText } = require('../src/search/noteDictionary');
const { getAllPerfumes } = require('../src/search/catalogRepo');

const queries = [
  'кавун',
  'кавуна',
  'кавуну',
  'аромат з кавуном',
  'підбери аромат кавуну',
  'вишня кавун',
];

console.log('normalize tests:');
console.table([
  ['Вишня,Кавун', normalizePhrase('Вишня,Кавун'), containsPhrase('Вишня,Кавун', 'кавун')],
  ['Нота серця: Кавун, Водний акорд', normalizePhrase('Нота серця: Кавун, Водний акорд'), containsPhrase('Нота серця: Кавун, Водний акорд', 'кавун')],
  ['Ромашка', normalizePhrase('Ромашка'), containsPhrase('Ромашка', 'ром')],
  ['Ром', normalizePhrase('Ром'), containsPhrase('Ром', 'ром')],
]);

console.log('\nRaw DB rows with кавун/watermelon in notes/name/version:');
const raw = getAllPerfumes(2000).filter((row) => {
  const text = [row.name, row.version, row.notes, row.keywords].filter(Boolean).join(' | ');
  return containsPhrase(text, 'кавун') || containsPhrase(text, 'watermelon');
});
console.table(raw.map((x) => ({ id: x.id, code: x.number_code, gender: x.gender, name: x.name, notes: String(x.notes || '').slice(0, 120) })));

for (const q of queries) {
  const t0 = Date.now();
  const notes = detectNotesInText(q);
  const rows = findExactNoteMatches(q, { limit: 30 });
  const ms = Date.now() - t0;

  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('DETECTED:', notes);
  console.log('TIME:', `${ms} ms`);
  console.log('COUNT:', rows.length);
  console.table(rows.map((x) => ({ id: x.id, code: x.number_code, gender: x.gender, score: Math.round(Number(x.match_score || 0)), why: (x.why_selected || []).join(' | '), name: x.name })));
}
