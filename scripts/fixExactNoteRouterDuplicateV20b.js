const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'index.js');
if (!fs.existsSync(file)) {
  console.error('❌ Не знайдено src/index.js. Запусти скрипт з кореня проєкту.');
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
const backup = `${file}.bak_v20b_router_${Date.now()}`;
fs.writeFileSync(backup, src);
console.log('backup:', backup);

// 1) Ensure exactly one require for onExactNoteText
src = src.replace(/\nconst \{ onExactNoteText \} = require\(["']\.\/flows\/exactNoteTelegramFlow["']\);/g, '');

const requireAnchor = /const \{[^\n]*onUserText[^\n]*\} = require\(["']\.\/flows\/perfumeChatFlow["']\);/;
if (requireAnchor.test(src)) {
  src = src.replace(requireAnchor, (m) => `${m}\nconst { onExactNoteText } = require("./flows/exactNoteTelegramFlow");`);
} else {
  // fallback: put after dotenv/config area or at top
  src = `const { onExactNoteText } = require("./flows/exactNoteTelegramFlow");\n${src}`;
}

// 2) Remove all old exact-note router blocks that were inserted before
src = src.replace(/\n\s*\/\/ EXACT_NOTE_ROUTER_V\d+[A-Z]?:[^\n]*\n\s*const handledExactNote = await onExactNoteText\(ctx\);\n\s*if \(handledExactNote\) return;\n/g, '\n');
src = src.replace(/\n\s*const handledExactNote = await onExactNoteText\(ctx\);\n\s*if \(handledExactNote\) return;\n/g, '\n');

// 3) Insert exactly one router block before onUserText(ctx)
const userFlowCall = /\n(\s*)const handledUser = await onUserText\(ctx\);/;
if (!userFlowCall.test(src)) {
  console.error('❌ Не знайшов рядок: const handledUser = await onUserText(ctx);');
  console.error('Відкрий src/index.js і встав router вручну перед onUserText(ctx).');
  fs.writeFileSync(file, src);
  process.exit(1);
}

src = src.replace(userFlowCall, (m, indent) => `\n${indent}// EXACT_NOTE_ROUTER_V20B: exact note search must run before AI/profile flow\n${indent}const handledExactNote = await onExactNoteText(ctx);\n${indent}if (handledExactNote) return;\n${m}`);

fs.writeFileSync(file, src);
console.log('patched:', path.relative(process.cwd(), file));

const count = (src.match(/handledExactNote/g) || []).length;
const marker = src.includes('EXACT_NOTE_ROUTER_V20B');
console.log('handledExactNote count:', count);
console.log('has V20B marker:', marker);
if (count !== 2 || !marker) {
  console.warn('⚠️ Перевір src/index.js вручну: має бути 1 const handledExactNote і 1 if (handledExactNote).');
}
