const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'src/index.js');
const exactPath = path.join(ROOT, 'src/search/exactNoteSearch.js');
const flowPath = path.join(ROOT, 'src/flows/exactNoteTelegramFlow.js');

function backup(file) {
  if (!fs.existsSync(file)) return;
  const bak = file + '.bak_v19_' + Date.now();
  fs.copyFileSync(file, bak);
  console.log('backup:', bak);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
  console.log('patched:', path.relative(ROOT, file));
}

function ensureIndexRouter() {
  if (!fs.existsSync(indexPath)) throw new Error('src/index.js not found');
  let src = read(indexPath);
  backup(indexPath);

  if (!src.includes('onExactNoteText')) {
    const anchor = `const { onDetailAction } = require("./flows/detailFlow");`;
    if (!src.includes(anchor)) throw new Error('Cannot find detailFlow require anchor in src/index.js');
    src = src.replace(anchor, anchor + `\nconst { onExactNoteText } = require("./flows/exactNoteTelegramFlow"); // EXACT_NOTE_ROUTER_V19`);
  }

  if (!src.includes('EXACT_NOTE_ROUTER_V19_BEFORE_AI')) {
    const oldBlock = `  // perfume/user flow\n  if (role === "admin" || role === "user") {\n    const handledUser = await onUserText(ctx);\n    if (handledUser) return;\n  }`;
    const newBlock = `  // perfume/user flow\n  if (role === "admin" || role === "user") {\n    // EXACT_NOTE_ROUTER_V19_BEFORE_AI\n    // Exact note requests must be handled before AI/profile search.\n    const handledExactNote = await onExactNoteText(ctx);\n    if (handledExactNote) return;\n\n    const handledUser = await onUserText(ctx);\n    if (handledUser) return;\n  }`;
    if (!src.includes(oldBlock)) throw new Error('Cannot find perfume/user flow block in src/index.js');
    src = src.replace(oldBlock, newBlock);
  }

  write(indexPath, src);
}

function ensureExactAliases() {
  if (!fs.existsSync(exactPath)) throw new Error('src/search/exactNoteSearch.js not found');
  let src = read(exactPath);
  backup(exactPath);

  const marker = 'EXACT_NOTE_ALIASES_V19_LILAC_AND_MISSING_FRUITS';
  if (!src.includes(marker)) {
    const insert = `\n\n  // ${marker}\n  // Додаємо часті ноти, які в Excel/БД можуть бути записані як складені ноти\n  // або російськими/англійськими alias-ами.\n  if (/(^| )(бузок|бузку|бузком|бузковий|сирень|сирени|сиренью|lilac|green lilac)( |$)/i.test(t)) {\n    pushGroup("lilac", [\n      "бузок", "бузку", "бузком", "бузковий",\n      "зелений бузок", "зелений бузку",\n      "сирень", "сирени", "сиренью",\n      "lilac", "green lilac"\n    ]);\n  }\n\n  if (/(^| )(полуниця|полуниці|полуницю|полуницею|клубника|клубники|клубнику|strawberry)( |$)/i.test(t)) {\n    pushGroup("strawberry", [\n      "полуниця", "полуниці", "полуницю", "полуницею",\n      "клубника", "клубники", "клубнику",\n      "strawberry"\n    ]);\n  }\n\n  if (/(^| )(маракуя|маракуї|маракую|маракуєю|passion fruit|passionfruit)( |$)/i.test(t)) {\n    pushGroup("passion_fruit", [\n      "маракуя", "маракуї", "маракую", "маракуєю",\n      "passion fruit", "passionfruit"\n    ]);\n  }\n\n  if (/(^| )(базилік|базиліку|базиліком|базилик|базилика|basil)( |$)/i.test(t)) {\n    pushGroup("basil", [\n      "базилік", "базиліку", "базиліком",\n      "базилик", "базилика",\n      "basil"\n    ]);\n  }\n\n  if (/(^| )(гарбуз|гарбуза|гарбузу|гарбузом|тыква|тыквы|pumpkin)( |$)/i.test(t)) {\n    pushGroup("pumpkin", [\n      "гарбуз", "гарбуза", "гарбузу", "гарбузом",\n      "тыква", "тыквы", "тыкву",\n      "pumpkin"\n    ]);\n  }\n`;

    const returnAnchor = '  return { canonicalNotes: uniq(canonicalNotes), exactTerms: uniq(exactTerms) };';
    if (!src.includes(returnAnchor)) throw new Error('Cannot find addHardAliases return anchor');
    src = src.replace(returnAnchor, insert + '\n' + returnAnchor);
  }

  write(exactPath, src);
}

function ensureFlowFile() {
  if (!fs.existsSync(flowPath)) {
    throw new Error('src/flows/exactNoteTelegramFlow.js was not copied from ZIP. Unzip again into project root.');
  }
  console.log('ok:', path.relative(ROOT, flowPath));
}

ensureFlowFile();
ensureIndexRouter();
ensureExactAliases();
console.log('Done. Run: node scripts/checkLilacExactNoteRouterV19.js');
