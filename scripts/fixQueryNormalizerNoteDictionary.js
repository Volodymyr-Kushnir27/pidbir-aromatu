const fs = require('fs');
const path = require('path');

const rel = 'src/search/queryNormalizer.js';
const file = path.join(process.cwd(), rel);
if (!fs.existsSync(file)) throw new Error(`File not found: ${rel}`);

let s = fs.readFileSync(file, 'utf8');
const backup = `${file}.bak_note_dictionary_${Date.now()}`;
fs.copyFileSync(file, backup);
console.log('backup:', backup);

// The all-db-notes version uses NOTE_DICTIONARY from noteDictionary.js.
// Some older patches accidentally reintroduced EXACT_NOTE_GROUPS.
if (!s.includes('NOTE_DICTIONARY')) {
  throw new Error('NOTE_DICTIONARY import not found. First install pidbir-aromatu-all-db-notes-fix.zip');
}

s = s.replace(/Object\.entries\(EXACT_NOTE_GROUPS\)/g, 'Object.entries(NOTE_DICTIONARY)');
s = s.replace(/EXACT_NOTE_GROUPS\[canonicalNote\]\?\.exact/g, 'NOTE_DICTIONARY[canonicalNote]?.exact');
s = s.replace(/EXACT_NOTE_GROUPS\[canonicalNote\]\?\.fallback/g, 'NOTE_DICTIONARY[canonicalNote]?.fallback');

// If the patch produced a plain Set return, keep the project's unique() helper where available.
s = s.replace(/return \[\.\.new Set\(found\)\];/g, 'return unique(found);');

fs.writeFileSync(file, s);
console.log('patched:', rel);

const stillBroken = /EXACT_NOTE_GROUPS/.test(s);
if (stillBroken) {
  console.warn('WARNING: EXACT_NOTE_GROUPS still exists somewhere. Run: grep -n "EXACT_NOTE_GROUPS" src/search/queryNormalizer.js');
} else {
  console.log('OK: queryNormalizer now uses NOTE_DICTIONARY');
}
