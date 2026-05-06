const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'src', 'index.js');
const flowDir = path.join(root, 'src', 'flows');
const sourceFlow = path.join(__dirname, '..', 'src', 'flows', 'exactNoteTelegramFlow.js');
const targetFlow = path.join(flowDir, 'exactNoteTelegramFlow.js');

function die(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) die('src/index.js not found. Run script from project root.');
if (!fs.existsSync(sourceFlow)) die('source exactNoteTelegramFlow.js not found in ZIP.');

fs.mkdirSync(flowDir, { recursive: true });
fs.copyFileSync(sourceFlow, targetFlow);
console.log('copied: src/flows/exactNoteTelegramFlow.js');

let src = fs.readFileSync(indexPath, 'utf8');
const marker = 'EXACT_NOTE_ROUTER_V16';
if (src.includes(marker)) {
  console.log('✅ src/index.js already patched:', marker);
  process.exit(0);
}

const backup = `${indexPath}.bak_exact_note_router_v16_${Date.now()}`;
fs.writeFileSync(backup, src);
console.log('backup:', backup);

const importBlock = `\nconst { onExactNoteText } = require("./flows/exactNoteTelegramFlow"); // ${marker}\n`;

const afterPerfumeImport = `const {\n  onUserPickAction,\n  onUserText,\n  disableMode,\n} = require("./flows/perfumeChatFlow");`;

if (src.includes(afterPerfumeImport)) {
  src = src.replace(afterPerfumeImport, afterPerfumeImport + importBlock);
} else {
  const anchor = `const { onDetailAction } = require("./flows/detailFlow");`;
  if (!src.includes(anchor)) die('Could not find import anchor in src/index.js');
  src = src.replace(anchor, anchor + importBlock);
}

const oldCall = `const handledUser = await onUserText(ctx);\n    if (handledUser) return;`;
const newCall = `const handledExactNote = await onExactNoteText(ctx); // ${marker}\n    if (handledExactNote) return;\n\n    const handledUser = await onUserText(ctx);\n    if (handledUser) return;`;

if (!src.includes(oldCall)) {
  die('Could not find user-flow anchor: const handledUser = await onUserText(ctx);');
}

src = src.replace(oldCall, newCall);
fs.writeFileSync(indexPath, src);
console.log('patched: src/index.js');
console.log('Now run: node scripts/checkExactNoteRouterV16.js');
