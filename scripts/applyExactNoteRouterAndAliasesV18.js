const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'src/index.js');
const exactPath = path.join(root, 'src/search/exactNoteSearch.js');
const flowPath = path.join(root, 'src/flows/exactNoteTelegramFlow.js');
const bundledFlowPath = path.join(__dirname, '../src/flows/exactNoteTelegramFlow.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function backup(file, label) {
  if (!fs.existsSync(file)) return;
  const out = file + '.bak_' + label + '_' + Date.now();
  fs.copyFileSync(file, out);
  console.log('backup:', out);
}

function patchIndex() {
  if (!fs.existsSync(indexPath)) throw new Error('src/index.js not found');
  let src = read(indexPath);

  if (!src.includes('EXACT_NOTE_ROUTER_V18')) {
    backup(indexPath, 'v18_index');

    if (!src.includes('onExactNoteText')) {
      const anchor = 'const { onDetailAction } = require("./flows/detailFlow");';
      if (!src.includes(anchor)) throw new Error('Cannot find detailFlow require anchor in src/index.js');
      src = src.replace(anchor, anchor + '\n\n// EXACT_NOTE_ROUTER_V18\nconst { onExactNoteText } = require("./flows/exactNoteTelegramFlow");');
    }

    const oldBlock = 'const handledUser = await onUserText(ctx);\n    if (handledUser) return;';
    const newBlock = '// EXACT_NOTE_ROUTER_V18: exact note search must run before AI/user flow\n    const handledExactNote = await onExactNoteText(ctx);\n    if (handledExactNote) return;\n\n    const handledUser = await onUserText(ctx);\n    if (handledUser) return;';

    if (!src.includes(oldBlock)) {
      throw new Error('Cannot find perfume/user flow anchor in src/index.js: const handledUser = await onUserText(ctx);');
    }

    src = src.replace(oldBlock, newBlock);
    write(indexPath, src);
  }

  console.log('patched:', path.relative(root, indexPath));
}

function patchAliases() {
  if (!fs.existsSync(exactPath)) throw new Error('src/search/exactNoteSearch.js not found');
  let src = read(exactPath);

  if (src.includes('EXACT_NOTE_ALIASES_V18')) {
    console.log('aliases already present:', path.relative(root, exactPath));
    return;
  }

  backup(exactPath, 'v18_aliases');

  const insertBefore = '  if (/(^| )(ром|рому|ромом|rum|віскі|виски|whisky|whiskey|bourbon|scotch)( |$)/i.test(t)) {';
  if (!src.includes(insertBefore)) {
    throw new Error('Cannot find alcohol alias anchor in exactNoteSearch.js');
  }

  const extra = `
  // EXACT_NOTE_ALIASES_V18
  // Додаткові фруктові/зелені ноти, які продавці часто вводять у відмінках.
  if (/(^| )(полуниця|полуниці|полуницю|полуницею|клубника|клубники|клубнику|клубникой|strawberry|strawberries)( |$)/i.test(t)) {
    pushGroup("strawberry", ["полуниця", "полуниці", "полуницю", "полуницею", "клубника", "клубники", "клубнику", "клубникой", "strawberry", "strawberries"]);
  }
  if (/(^| )(маракуя|маракуї|маракую|маракуєю|маракуйя|маракуйи|маракуйю|passion fruit|passionfruit|passion)( |$)/i.test(t)) {
    pushGroup("passionfruit", ["маракуя", "маракуї", "маракую", "маракуєю", "маракуйя", "маракуйи", "маракуйю", "passion fruit", "passionfruit"]);
  }
  if (/(^| )(базилік|базиліку|базиліком|базилик|базилика|базиликом|basil)( |$)/i.test(t)) {
    pushGroup("basil", ["базилік", "базиліку", "базиліком", "базилик", "базилика", "базиликом", "basil"]);
  }
  if (/(^| )(гарбуз|гарбуза|гарбузу|гарбузом|тыква|тыквы|тыкву|тыквой|pumpkin)( |$)/i.test(t)) {
    pushGroup("pumpkin", ["гарбуз", "гарбуза", "гарбузу", "гарбузом", "тыква", "тыквы", "тыкву", "тыквой", "pumpkin"]);
  }
  if (/(^| )(яблуко|яблука|яблуком|яблуку|яблоко|яблока|яблоком|apple)( |$)/i.test(t)) {
    pushGroup("apple", ["яблуко", "яблука", "яблуком", "яблуку", "яблоко", "яблока", "яблоком", "apple", "green apple", "зелене яблуко", "червоне яблуко"]);
  }
  if (/(^| )(груша|груші|грушу|грушею|груши|грушу|pear)( |$)/i.test(t)) {
    pushGroup("pear", ["груша", "груші", "грушу", "грушею", "груши", "pear"]);
  }
`;

  src = src.replace(insertBefore, extra + '\n' + insertBefore);
  write(exactPath, src);
  console.log('patched:', path.relative(root, exactPath));
}

function copyFlow() {
  if (!fs.existsSync(bundledFlowPath)) throw new Error('Bundled exactNoteTelegramFlow.js not found in zip');
  backup(flowPath, 'v18_flow');
  write(flowPath, read(bundledFlowPath));
  console.log('patched:', path.relative(root, flowPath));
}

patchIndex();
copyFlow();
patchAliases();
console.log('Done. Run: node scripts/checkExactNoteRouterAndNotesV18.js');
