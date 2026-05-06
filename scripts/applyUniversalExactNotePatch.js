const fs = require("fs");
const path = require("path");

const root = process.cwd();
const file = path.join(root, "src/flows/perfumeChatFlow.js");
if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

let s = fs.readFileSync(file, "utf8");
const backup = `${file}.bak_universal_note_${Date.now()}`;
fs.writeFileSync(backup, s);
console.log("backup:", backup);

function ensureAfter(marker, addition) {
  if (s.includes(addition.trim())) return;
  const idx = s.indexOf(marker);
  if (idx === -1) {
    console.warn(`marker not found: ${marker}`);
    return;
  }
  s = s.slice(0, idx + marker.length) + "\n" + addition + s.slice(idx + marker.length);
}

ensureAfter(
  `const { findCandidates } = require("../search/candidateSearch");`,
  `const { parseLocalQuery } = require("../search/queryNormalizer");\nconst { findExactNoteMatches } = require("../search/exactNoteSearch");`
);

// Direct search must not catch "шлейфовий/фруктовий/квітковий" when a real note is present.
const fnNeedle = "function shouldUseDirectNameSearch(text) {";
const fnIdx = s.indexOf(fnNeedle);
if (fnIdx >= 0 && !s.slice(fnIdx, fnIdx + 1200).includes("UNIVERSAL_NOTE_FIRST_DIRECT_BYPASS")) {
  const pos = fnIdx + fnNeedle.length;
  s = s.slice(0, pos) + `
  // UNIVERSAL_NOTE_FIRST_DIRECT_BYPASS
  // If user asked for a real note from DB, exact-note search must run before keyword/name fallback.
  // Examples: "слива", "мед", "фіалка", "шлейфовий з вишнею", "парфуми з ромом".
  try {
    const local = require("../search/queryNormalizer").parseLocalQuery(text);
    if (local?.isExplicitNoteQuery || (local?.explicitNotes || []).length) return false;
  } catch {}
` + s.slice(pos);
}

const helper = `

async function handleExactNoteQueryEarly(ctx, userText, progressMsg) {
  const local = parseLocalQuery(userText);
  if (!local?.isExplicitNoteQuery && !(local?.explicitNotes || []).length) return null;

  const noteItems = findExactNoteMatches(userText, {
    limit: Number(process.env.SEARCH_LIMIT_CANDIDATES || 30),
    gender: local.gender,
  });

  if (!noteItems.length) return null;

  await updateProgressMessage(
    ctx,
    progressMsg,
    "✅ Знайшов точні збіги по ноті в базі.\\nПоказую спочатку аромати, де ця нота реально є в нотах."
  );

  const ordered = sortByScore(noteItems).slice(0, Number(process.env.SEARCH_LIMIT_CANDIDATES || 30));
  const firstBatch = ordered.slice(0, Number(SEARCH.TOP_K || 3));

  await ctx.reply(
    `✨ Підібрав ${ordered.length} варіант(ів) за точною нотою: спочатку унісекс, потім жіночі, потім чоловічі.`
  );

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

if (!s.includes("async function handleExactNoteQueryEarly")) {
  const marker = "function createRelaxedSearchProfile";
  const idx = s.indexOf(marker);
  if (idx >= 0) {
    s = s.slice(0, idx) + helper + "\n" + s.slice(idx);
  } else {
    console.warn("Could not insert helper automatically: createRelaxedSearchProfile marker not found");
  }
}

// Insert early exact-note handler after progress step 3. If your file already has old handler, replace it.
if (!s.includes("UNIVERSAL_EXACT_NOTE_EARLY_HANDLER")) {
  const oldV5 = /\/\/ V5_EXACT_NOTE_EARLY_HANDLER\n\s*const exactNoteHandled = await handleExactNoteQueryEarly\(ctx, userText, progressMsg\);\n\s*if \(exactNoteHandled\) return true;/;
  if (oldV5.test(s)) {
    s = s.replace(oldV5, `// UNIVERSAL_EXACT_NOTE_EARLY_HANDLER\n  const exactNoteHandled = await handleExactNoteQueryEarly(ctx, userText, progressMsg);\n  if (exactNoteHandled) return true;`);
  } else {
    const patterns = [
      /await updateProgressMessage\([\s\S]*?3\/7 Перевіряю keywords \/ опис \/ ноти[\s\S]*?\);/,
      /await updateProgressMessage\([\s\S]*?3\/7[\s\S]*?ноти[\s\S]*?\);/,
    ];

    let patched = false;
    for (const re of patterns) {
      const m = s.match(re);
      if (m) {
        const block = `${m[0]}\n\n  // UNIVERSAL_EXACT_NOTE_EARLY_HANDLER\n  const exactNoteHandled = await handleExactNoteQueryEarly(ctx, userText, progressMsg);\n  if (exactNoteHandled) return true;`;
        s = s.replace(m[0], block);
        patched = true;
        break;
      }
    }

    if (!patched) {
      console.warn("Could not auto-insert exact-note early handler.");
      console.warn("Manual insert after progress step 3:");
      console.warn('const exactNoteHandled = await handleExactNoteQueryEarly(ctx, userText, progressMsg);');
      console.warn('if (exactNoteHandled) return true;');
    }
  }
}

fs.writeFileSync(file, s, "utf8");
console.log("patched: src/flows/perfumeChatFlow.js");
console.log("Done. Run: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkUniversalExactNoteSearch.js");
