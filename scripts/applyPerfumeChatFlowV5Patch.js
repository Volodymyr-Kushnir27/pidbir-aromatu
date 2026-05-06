const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "src/flows/perfumeChatFlow.js");
if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

let s = fs.readFileSync(file, "utf8");
const backup = `${file}.backup-v5-${Date.now()}`;
fs.writeFileSync(backup, s);

function insertAfter(marker, addition) {
  if (s.includes(addition.trim())) return;
  const idx = s.indexOf(marker);
  if (idx === -1) throw new Error(`Marker not found: ${marker}`);
  const end = idx + marker.length;
  s = s.slice(0, end) + "\n" + addition + s.slice(end);
}

try {
  insertAfter(
    `const { findCandidates } = require("../search/candidateSearch");`,
    `const { parseLocalQuery } = require("../search/queryNormalizer");
const { findExactNoteMatches } = require("../search/exactNoteSearch");`
  );
} catch (e) {
  console.warn("Import patch skipped:", e.message);
}

const helper = `

async function handleExactNoteQueryEarly(ctx, userText, progressMsg) {
  const local = parseLocalQuery(userText);
  if (!local.isExplicitNoteQuery) return null;

  const noteItems = findExactNoteMatches(userText, {
    limit: Number(process.env.SEARCH_LIMIT_CANDIDATES || 30),
    gender: local.gender,
  });

  if (!noteItems.length) return null;

  await updateProgressMessage(
    ctx,
    progressMsg,
    "✅ Знайшов точні збіги по ноті в базі.\\nПоказую спочатку аромати, де ця нота реально є в нотах / keywords / version."
  );

  const ordered = sortByScore(noteItems).slice(0, Number(process.env.SEARCH_LIMIT_CANDIDATES || 30));
  setLastSearch(ctx, {
    mode: "exact_note",
    query: userText,
    items: ordered,
    sentIds: [],
    nextIndex: 0,
  });

  const firstBatch = ordered.slice(0, Number(SEARCH.TOP_K || 3));
  await ctx.reply(`✨ Знайшов ${ordered.length} варіант(ів) з точною нотою.`);
  const { sent } = await sendItemsBatch(ctx, firstBatch);

  setLastSearch(ctx, {
    mode: "exact_note",
    query: userText,
    items: ordered,
    sentIds: sent.map((x) => Number(x.id)),
    nextIndex: sent.length,
  });

  if (ordered.length > sent.length) {
    await ctx.reply(`➡️ Є ще ${ordered.length - sent.length} варіантів. Напишіть: "ще" або "дай ще 3"`);
  } else {
    await ctx.reply("✅ Це всі знайдені варіанти за цим запитом.");
  }

  return ordered;
}
`;

if (!s.includes("handleExactNoteQueryEarly")) {
  const marker = `function createRelaxedSearchProfile`;
  const idx = s.indexOf(marker);
  if (idx === -1) throw new Error(`Cannot insert helper, marker not found: ${marker}`);
  s = s.slice(0, idx) + helper + "\n" + s.slice(idx);
}

// Insert early handler after the progress step 3 text block when possible.
if (!s.includes("// V5_EXACT_NOTE_EARLY_HANDLER")) {
  const patterns = [
    /await updateProgressMessage\([\s\S]*?3\/7 Перевіряю keywords \/ опис \/ ноти[\s\S]*?\);/,
    /await updateProgressMessage\([\s\S]*?3\/7[\s\S]*?ноти[\s\S]*?\);/,
  ];

  let patched = false;
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const block = `${m[0]}\n\n  // V5_EXACT_NOTE_EARLY_HANDLER\n  const exactNoteHandled = await handleExactNoteQueryEarly(ctx, userText, progressMsg);\n  if (exactNoteHandled) return true;`;
      s = s.replace(m[0], block);
      patched = true;
      break;
    }
  }

  if (!patched) {
    console.warn("Could not auto-insert exact-note early handler. Add this manually after progress step 3:");
    console.warn(`const exactNoteHandled = await handleExactNoteQueryEarly(ctx, userText, progressMsg);\nif (exactNoteHandled) return true;`);
  }
}

fs.writeFileSync(file, s);
console.log("Patched:", file);
console.log("Backup:", backup);
