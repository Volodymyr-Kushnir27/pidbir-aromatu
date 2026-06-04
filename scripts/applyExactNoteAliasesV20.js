const fs = require('fs');
const path = require('path');

const root = process.cwd();
const exactPath = path.join(root, 'src/search/exactNoteSearch.js');
const indexPath = path.join(root, 'src/index.js');

function backup(file, tag) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const bak = `${file}.bak_${tag}_${Date.now()}`;
  fs.copyFileSync(file, bak);
  console.log('backup:', bak);
}

function replaceAddHardAliases() {
  let s = fs.readFileSync(exactPath, 'utf8');
  if (s.includes('EXACT_NOTE_ALIASES_V20')) {
    console.log('exactNoteSearch.js already has V20 aliases');
    return;
  }
  const start = s.indexOf('function addHardAliases(');
  const end = s.indexOf('\nfunction buildRequestedTerms', start);
  if (start === -1 || end === -1) {
    throw new Error('Cannot find addHardAliases() block in src/search/exactNoteSearch.js');
  }

  const newBlock = String.raw`function addHardAliases(rawText, canonicalNotes, exactTerms) {
  // EXACT_NOTE_ALIASES_V20
  const t = normalizeForExact(rawText);

  const pushGroup = (canonical, terms) => {
    if (!canonicalNotes.includes(canonical)) canonicalNotes.push(canonical);
    for (const term of terms) exactTerms.push(term);
  };

  const hasAny = (terms) => terms.some((term) => containsExactTerm(t, term));

  // Фрукти / ягоди
  if (hasAny(['кавун', 'кавуна', 'кавуну', 'кавуном', 'кавуновий', 'арбуз', 'арбуза', 'арбузу', 'арбузом', 'арбузный', 'watermelon', 'water melon'])) {
    pushGroup('watermelon', ['кавун', 'кавуна', 'кавуну', 'кавуном', 'кавуновий', 'арбуз', 'арбуза', 'арбузу', 'арбузом', 'арбузный', 'watermelon', 'water melon']);
  }
  if (hasAny(['диня', 'дині', 'диню', 'динею', 'динєю', 'дыня', 'дыни', 'дыню', 'дыней', 'melon'])) {
    pushGroup('melon', ['диня', 'дині', 'диню', 'динею', 'динєю', 'дыня', 'дыни', 'дыню', 'дыней', 'melon']);
  }
  if (hasAny(['полуниця', 'полуниці', 'полуницю', 'полуницею', 'клубника', 'клубники', 'клубнику', 'клубникой', 'strawberry', 'strawberries'])) {
    pushGroup('strawberry', ['полуниця', 'полуниці', 'полуницю', 'полуницею', 'клубника', 'клубники', 'клубнику', 'клубникой', 'strawberry', 'strawberries']);
  }
  if (hasAny(['маракуя', 'маракуї', 'маракую', 'маракуєю', 'маракуйя', 'маракуйи', 'маракуйю', 'passion fruit', 'passionfruit'])) {
    pushGroup('passionfruit', ['маракуя', 'маракуї', 'маракую', 'маракуєю', 'маракуйя', 'маракуйи', 'маракуйю', 'passion fruit', 'passionfruit']);
  }
  if (hasAny(['гарбуз', 'гарбуза', 'гарбузу', 'гарбузом', 'тыква', 'тыквы', 'тыкву', 'тыквой', 'pumpkin'])) {
    pushGroup('pumpkin', ['гарбуз', 'гарбуза', 'гарбузу', 'гарбузом', 'тыква', 'тыквы', 'тыкву', 'тыквой', 'pumpkin']);
  }
  if (hasAny(['вишня', 'вишні', 'вишню', 'вишнею', 'вишневий', 'черешня', 'черешні', 'черешню', 'cherry', 'black cherry', 'sweet cherry'])) {
    pushGroup('cherry', ['вишня', 'вишні', 'вишню', 'вишнею', 'вишневий', 'черешня', 'черешні', 'черешню', 'cherry', 'black cherry', 'sweet cherry']);
  }
  if (hasAny(['слива', 'сливи', 'сливу', 'сливою', 'червона слива', 'plum', 'red plum'])) {
    pushGroup('plum', ['слива', 'сливи', 'сливу', 'сливою', 'червона слива', 'plum', 'red plum']);
  }
  if (hasAny(['яблуко', 'яблука', 'яблуком', 'зелене яблуко', 'червоне яблуко', 'apple', 'green apple', 'red apple'])) {
    pushGroup('apple', ['яблуко', 'яблука', 'яблуком', 'зелене яблуко', 'червоне яблуко', 'apple', 'green apple', 'red apple']);
  }
  if (hasAny(['груша', 'груші', 'грушу', 'грушею', 'pear'])) {
    pushGroup('pear', ['груша', 'груші', 'грушу', 'грушею', 'pear']);
  }

  // Квіти / зелень
  if (hasAny(['бузок', 'бузку', 'бузком', 'бузковий', 'зелений бузок', 'сирень', 'сирени', 'сиренью', 'сиреневый', 'lilac', 'green lilac'])) {
    pushGroup('lilac', ['бузок', 'бузку', 'бузком', 'бузковий', 'зелений бузок', 'сирень', 'сирени', 'сиренью', 'сиреневый', 'lilac', 'green lilac']);
  }
  if (hasAny(['базилік', 'базиліку', 'базиліком', 'базилик', 'базилика', 'базиликом', 'basil'])) {
    pushGroup('basil', ['базилік', 'базиліку', 'базиліком', 'базилик', 'базилика', 'базиликом', 'basil']);
  }
  if (hasAny(['фіалка', 'фіалки', 'фіалку', 'фіалкою', 'фіалковий', 'фіалковий акорд', 'листя фіалки', 'аркуш фіалки', 'фиалка', 'violet', 'violet leaf'])) {
    pushGroup('violet', ['фіалка', 'фіалки', 'фіалку', 'фіалкою', 'фіалковий', 'фіалковий акорд', 'листя фіалки', 'аркуш фіалки', 'фиалка', 'violet', 'violet leaf']);
  }
  if (hasAny(['жасмин', 'жасмину', 'жасмін', 'жасміну', 'жасмин самбак', 'жасмін самбак', 'самбак', 'jasmine', 'jasmine sambac'])) {
    pushGroup('jasmine', ['жасмин', 'жасмину', 'жасмін', 'жасміну', 'жасмин самбак', 'жасмін самбак', 'самбак', 'jasmine', 'jasmine sambac']);
  }
  if (hasAny(['мята', 'мяти', 'мятою', "м'ята", "м'яти", "м'ятою", 'м’ята', 'м’яти', 'м’ятою', 'заморожена мята', "заморожена м'ята", 'mint', 'peppermint'])) {
    pushGroup('mint', ['мята', 'мяти', 'мятою', "м'ята", "м'яти", "м'ятою", 'м’ята', 'м’яти', 'м’ятою', 'заморожена мята', "заморожена м'ята", 'mint', 'peppermint']);
  }

  // Пряні / гурманські / алкогольні
  if (hasAny(['імбир', 'імбиру', 'імбиром', 'імбирь', 'имбир', 'имбирь', 'ginger', 'заморожений імбир', 'квітка імбиру'])) {
    pushGroup('ginger', ['імбир', 'імбиру', 'імбиром', 'імбирь', 'имбир', 'имбирь', 'ginger', 'заморожений імбир', 'квітка імбиру']);
  }
  if (hasAny(['мед', 'меду', 'медом', 'медовий', 'білий мед', 'honey'])) {
    pushGroup('honey', ['мед', 'меду', 'медом', 'медовий', 'білий мед', 'honey']);
  }
  if (hasAny(['ром', 'рому', 'ромом', 'rum', 'віскі', 'виски', 'whisky', 'whiskey', 'bourbon', 'scotch'])) {
    pushGroup('alcohol', ['ром', 'рому', 'ромом', 'rum', 'віскі', 'виски', 'whisky', 'whiskey', 'bourbon', 'scotch', 'коньяк', 'коньяку', 'коньяком', 'cognac', 'brandy', 'лікер', 'liqueur', 'горілка', 'vodka', 'вино', 'wine', 'шампанське', 'champagne']);
  }

  return { canonicalNotes: uniq(canonicalNotes), exactTerms: uniq(exactTerms) };
}`;

  backup(exactPath, 'v20_aliases');
  s = s.slice(0, start) + newBlock + s.slice(end);
  fs.writeFileSync(exactPath, s, 'utf8');
  console.log('patched:', path.relative(root, exactPath));
}

function ensureIndexRouter() {
  if (!fs.existsSync(indexPath)) {
    console.log('skip index router: src/index.js not found');
    return;
  }
  let s = fs.readFileSync(indexPath, 'utf8');
  let changed = false;

  if (!s.includes('onExactNoteText')) {
    const requireLine = 'const { onExactNoteText } = require("./flows/exactNoteTelegramFlow");\n';
    const anchor = /const \{[^\n]*onUserText[^\n]*\} = require\(["']\.\/flows\/perfumeChatFlow["']\);\n/;
    if (anchor.test(s)) {
      s = s.replace(anchor, (m) => m + requireLine);
    } else {
      s = requireLine + s;
    }
    changed = true;
  }

  if (!s.includes('EXACT_NOTE_ROUTER_V20')) {
    const block = `\n    // EXACT_NOTE_ROUTER_V20: exact note search must run before AI/profile flow\n    const handledExactNote = await onExactNoteText(ctx);\n    if (handledExactNote) return;\n`;
    if (s.includes('const handledUser = await onUserText(ctx);')) {
      s = s.replace('const handledUser = await onUserText(ctx);', block + '\n    const handledUser = await onUserText(ctx);');
      changed = true;
    } else if (s.includes('await onUserText(ctx);')) {
      s = s.replace('await onUserText(ctx);', block + '\n    await onUserText(ctx);');
      changed = true;
    } else {
      console.warn('Could not find onUserText(ctx) call in src/index.js. Router was not inserted.');
    }
  }

  if (changed) {
    backup(indexPath, 'v20_router');
    fs.writeFileSync(indexPath, s, 'utf8');
    console.log('patched:', path.relative(root, indexPath));
  } else {
    console.log('index router already looks connected');
  }
}

replaceAddHardAliases();
ensureIndexRouter();
console.log('Done. Run: node scripts/checkExactNoteV20.js');
