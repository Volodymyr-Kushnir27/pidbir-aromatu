const fs = require("fs");
const path = require("path");

const targetPath = path.join(process.cwd(), "src", "flows", "perfumeChatFlow.js");

const newFunction = `function shouldUseDirectNameSearch(text) {
  const t = norm(text);
  if (!t) return false;

  if (findKnownReference(t)) return false;

  // Не передаємо у direct-search слова статі/наміру як частину назви.
  // Приклад: "чоловічі том форд" -> "tom ford".
  let cleaned = t;
  try {
    cleaned = require("../search/directNameKeywordSearch").cleanDirectQuery(t) || t;
  } catch {}

  const tokens = extractUsefulTokens(cleaned);
  if (!tokens.length) return false;

  // Direct-пошук тільки для коротких name/brand запитів.
  // Нотні/стильові запити типу "солодкий ванільний" підуть далі в AI/profile.
  if (tokens.length >= 1 && tokens.length <= 6) {
    const blocked = new Set([
      "аромат",
      "аромату",
      "парфум",
      "парфуми",
      "духи",
      "нотою",
      "нота",
      "ноти",
      "нотами",
      "схожий",
      "схожа",
      "схоже",
      "підбери",
      "знайди",
      "хочу",
      "треба",
      "солодкий",
      "свіжий",
      "цитрус",
      "ваніль",
      "мускус",
      "шкіра",
      "тютюн",
      "табак",
      "деревний",
      "квітковий",
      "фруктовий",
      "жіночі",
      "жіночий",
      "чоловічі",
      "чоловічий",
      "унісекс",
      "женские",
      "мужские",
    ]);

    const hasBlockedOnly = tokens.every((token) => blocked.has(norm(token)));
    if (hasBlockedOnly) return false;

    return true;
  }

  return false;
}`;

function findFunctionRange(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  if (start === -1) return null;

  const openBrace = source.indexOf("{", start);
  if (openBrace === -1) return null;

  let depth = 0;
  let inString = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }

  return null;
}

if (!fs.existsSync(targetPath)) {
  console.error(`❌ Не знайдено файл: ${targetPath}`);
  process.exit(1);
}

const source = fs.readFileSync(targetPath, "utf8");
const range = findFunctionRange(source, "shouldUseDirectNameSearch");

if (!range) {
  console.error("❌ Не знайшов функцію shouldUseDirectNameSearch у src/flows/perfumeChatFlow.js");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${targetPath}.bak-${stamp}`;
fs.writeFileSync(backupPath, source, "utf8");

const updated = source.slice(0, range.start) + newFunction + source.slice(range.end);
fs.writeFileSync(targetPath, updated, "utf8");

console.log("✅ Оновлено src/flows/perfumeChatFlow.js");
console.log(`🗂 Backup: ${backupPath}`);
console.log("✅ Direct-search тепер чистить gender/intent слова перед рішенням, чи йти в БД.");
