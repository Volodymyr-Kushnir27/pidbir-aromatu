const fs = require("fs");
const path = require("path");

const indexPath = path.resolve("src/index.js");

if (!fs.existsSync(indexPath)) {
  console.error("❌ Не знайдено src/index.js. Запусти скрипт з кореня проєкту.");
  process.exit(1);
}

let content = fs.readFileSync(indexPath, "utf8");
const backupPath = `${indexPath}.bak_duplicate_exact_note_${Date.now()}`;
fs.writeFileSync(backupPath, content, "utf8");

const before = content;

// Прибирає дубльований блок, який створює помилку:
// SyntaxError: Identifier 'handledExactNote' has already been declared
content = content.replace(
  /\n\s*\/\/ EXACT_NOTE_ROUTER_V20:[^\n]*\n\s*const handledExactNote = await onExactNoteText\(ctx\);\n\s*if \(handledExactNote\) return;\n/g,
  "\n"
);

// Додатковий страховочний варіант: якщо залишилось кілька однакових const у одному файлі,
// залишаємо перший виклик exact-note router, наступні дублікати видаляємо разом з if-блоком.
const marker = "const handledExactNote = await onExactNoteText(ctx);";
let count = 0;
const lines = content.split(/\r?\n/);
const out = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.includes(marker)) {
    count += 1;

    if (count > 1) {
      // Якщо перед дублем стоїть коментар EXACT_NOTE_ROUTER, прибираємо і його.
      if (
        out.length &&
        /EXACT_NOTE_ROUTER_V\d+/.test(out[out.length - 1])
      ) {
        out.pop();
      }

      // Пропускаємо сам const
      // І якщо наступний рядок — if (handledExactNote) return; — пропускаємо його теж.
      const next = lines[i + 1] || "";
      if (/if\s*\(\s*handledExactNote\s*\)\s*return\s*;/.test(next)) {
        i += 1;
      }
      continue;
    }
  }

  out.push(line);
}

content = out.join("\n");

// Нормалізуємо коментар першого роутера, щоб було зрозуміло, що це актуальний блок.
content = content.replace(
  /\/\/ EXACT_NOTE_ROUTER_V\d+:[^\n]*/,
  "// EXACT_NOTE_ROUTER: exact note search must run before AI/user flow"
);

if (content === before) {
  console.log("⚠️ Дублікат не знайдено або файл уже виправлений.");
} else {
  fs.writeFileSync(indexPath, content, "utf8");
  console.log(`✅ Виправлено src/index.js`);
  console.log(`Backup: ${backupPath}`);
}

const occurrences = (content.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
console.log(`handledExactNote declarations: ${occurrences}`);

if (occurrences > 1) {
  console.error("❌ Все ще є більше одного const handledExactNote. Потрібна ручна перевірка src/index.js.");
  process.exit(1);
}

console.log("✅ Перевірка пройдена. Тепер можна деплоїти/перезапускати сервіс.");
