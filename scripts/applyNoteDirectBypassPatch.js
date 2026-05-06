const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/search/directNameKeywordSearch.js');
if (!fs.existsSync(file)) {
  console.error('❌ Не знайдено src/search/directNameKeywordSearch.js. Запусти скрипт з кореня проєкту.');
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');

if (!s.includes('function isLikelyPureNoteRequest(')) {
  const marker = 'function searchByNameAndKeywords(query, options = {}) {';
  const helper = String.raw`
function isLikelyPureNoteRequest(query) {
  const raw = norm(query);
  if (!raw) return false;

  // Запити типу "аромат з кавуном", "підбери аромат кавуну", "з нотою ванілі"
  // НЕ є пошуком назви/бренду. Їх не можна ганяти через direct name search.
  const hasNoteIntent = /(^|\s)(аромат|аромату|ароматом|парфум|парфуми|духи|нота|нотою|ноти|notes?|with|з|із|с)(\s|$)/i.test(raw);

  const noteWords = [
    'кавун', 'кавуну', 'кавуном', 'арбуз', 'арбузом', 'watermelon',
    'вишня', 'вишнею', 'cherry',
    'персик', 'персиком', 'peach',
    'лимон', 'лимоном', 'lemon',
    'ваніль', 'ваніллю', 'ваниль', 'vanilla',
    'кокос', 'coconut',
    'ананас', 'pineapple',
    'полуниця', 'клубника', 'strawberry',
    'малина', 'raspberry',
    'яблуко', 'яблоко', 'apple',
    'груша', 'pear',
    'мускус', 'musk',
    'жасмин', 'jasmine',
    'троянда', 'роза', 'rose',
    'кава', 'кофе', 'coffee',
    'тютюн', 'табак', 'tobacco',
    'шкіра', 'кожа', 'leather',
    'бергамот', 'bergamot'
  ];

  const hasNoteWord = noteWords.some((w) => raw.includes(w));
  if (!hasNoteIntent || !hasNoteWord) return false;

  // Якщо є явний бренд/назва — не блокуємо direct search.
  const brandWords = [
    'tom ford', 'том форд', 'creed', 'крид', 'крід', 'paco', 'рабан', 'rabanne',
    'dolce', 'gabbana', 'дольче', 'габана', 'габбана', 'chanel', 'versace',
    'armani', 'zara', 'mancera', 'montale', 'kilian', 'dior', 'givenchy', 'lacoste'
  ];

  const hasBrand = brandWords.some((w) => raw.includes(w));
  return !hasBrand;
}

`;
  if (!s.includes(marker)) {
    console.error('❌ Не знайшов function searchByNameAndKeywords(...) у directNameKeywordSearch.js');
    process.exit(1);
  }
  s = s.replace(marker, helper + marker);
}

const startMarker = 'function searchByNameAndKeywords(query, options = {}) {';
const guard = String.raw`
  if (isLikelyPureNoteRequest(query)) {
    if (String(process.env.SEARCH_DEBUG || "0") === "1") {
      console.log("[directNameKeywordSearch] skipped pure note request", { query });
    }
    return [];
  }
`;

if (!s.includes('[directNameKeywordSearch] skipped pure note request')) {
  const idx = s.indexOf(startMarker);
  if (idx === -1) {
    console.error('❌ Не знайшов searchByNameAndKeywords для вставки guard.');
    process.exit(1);
  }
  const openIdx = s.indexOf('{', idx);
  s = s.slice(0, openIdx + 1) + '\n' + guard + s.slice(openIdx + 1);
}

const backup = file + '.backup-note-direct-bypass-' + Date.now();
fs.copyFileSync(file, backup);
fs.writeFileSync(file, s);
console.log('✅ Patched directNameKeywordSearch.js');
console.log('Backup:', backup);
