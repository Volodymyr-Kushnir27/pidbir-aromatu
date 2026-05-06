require("dotenv").config();
const { NOTE_DICTIONARY, BASE_DB_NOTES } = require("../src/search/noteDictionary");
const { getExplicitRequestedNotes } = require("../src/search/queryNormalizer");

console.log("BASE_DB_NOTES:", BASE_DB_NOTES.length);
console.log("NOTE_DICTIONARY groups:", Object.keys(NOTE_DICTIONARY).length);

const tests = [
  "кавун", "кавуна", "кавуну", "кавуном",
  "жасмін", "жасмин", "з жасмином",
  "персик", "персиком", "перець", "рожевий перець",
  "амбра", "амброю", "мускус", "кедр", "сандал",
  "троянда", "бергамот", "ірис", "пачулі", "ветивер",
  "ваніль", "лимон", "апельсин", "кава", "тютюн", "шкіра",
];

for (const q of tests) {
  console.log(q, "=>", getExplicitRequestedNotes(q));
}
