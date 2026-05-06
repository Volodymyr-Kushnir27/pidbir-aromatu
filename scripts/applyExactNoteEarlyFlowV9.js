const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'src/flows/perfumeChatFlow.js');
if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

let s = fs.readFileSync(file, 'utf8');
const backup = `${file}.bak_exact_note_v9_${Date.now()}`;
fs.writeFileSync(backup, s);
console.log('backup:', backup);

function insertAfter(needle, addition) {
  if (s.includes(addition.trim())) return true;
  const idx = s.indexOf(needle);
  if (idx === -1) return false;
  s = s.slice(0, idx + needle.length) + '\n' + addition + s.slice(idx + needle.length);
  return true;
}

function insertBeforeRegex(regex, addition) {
  if (s.includes(addition.trim())) return true;
  const m = s.match(regex);
  if (!m || typeof m.index !== 'number') return false;
  s = s.slice(0, m.index) + addition + '\n' + s.slice(m.index);
  return true;
}

// 1) imports
insertAfter(
  'const { findCandidates } = require("../search/candidateSearch");',
  'const { parseLocalQuery } = require("../search/queryNormalizer");\nconst { findExactNoteMatches } = require("../search/exactNoteSearch");'
);

// 2) make shouldUseDirectNameSearch always bypass direct name search for real note queries.
const fnNeedle = 'function shouldUseDirectNameSearch(text) {';
const fnIdx = s.indexOf(fnNeedle);
if (fnIdx >= 0 && !s.slice(fnIdx, fnIdx + 1800).includes('V9_EXACT_NOTE_DIRECT_BYPASS')) {
  const pos = fnIdx + fnNeedle.length;
  s = s.slice(0, pos) + `
  // V9_EXACT_NOTE_DIRECT_BYPASS
  // Real note requests must not be handled as keyword/name matches.
  // Examples: "кавун", "мед", "фіалка", "шлейфовий з вишнею", "ром чи віскі".
  try {
    const local = require("../search/queryNormalizer").parseLocalQuery(text);
    if (local?.isExplicitNoteQuery || (local?.explicitNotes || []).length) return false;
  } catch {}
` + s.slice(pos);
}

// 3) robust helper. It sends ALL exact note matches up to SEARCH_LIMIT_CANDIDATES.
const helper = `

async function handleExactNoteQueryEarlyV9(ctx, userText, progressMsg) {
  const local = parseLocalQuery(userText);
  if (!local?.isExplicitNoteQuery && !(local?.explicitNotes || []).length) return null;

  const limit = Math.min(Number(process.env.SEARCH_LIMIT_CANDIDATES || 30), 30);
  const noteItems = findExactNoteMatches(userText, {
    limit,
    gender: local.gender || null,
  });

  if (!noteItems.length) return null;

  await updateProgressMessage(
    ctx,
    progressMsg,
    "✅ Знайшов точні збіги по ноті в базі.\\nПоказую аромати, де ця нота реально є в нотах / назві / версії."
  );

  const ordered = typeof buildRandomGenderOrderedList === "function"
    ? buildRandomGenderOrderedList(noteItems, local.gender || null)
    : sortByScore(noteItems);

  const limited = uniqById(ordered).slice(0, limit);
  const firstBatch = limited.slice(0, Number(SEARCH.TOP_K || 3));

  const noteLabel = (local.explicitNoteDetails || [])
    .map((x) => (x.terms || [])[0] || x.canonical)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");

  await ctx.reply(
    `✨ Знайшов ${limited.length} варіант(ів) за точною нотою${noteLabel ? `: ${noteLabel}` : ""}.`
  );

  const { sent } = await sendItemsBatch(ctx, firstBatch);

  setLastSearch(ctx, {
    mode: "exact_note",
    query: userText,
    items: limited,
    sentIds: sent.map((x) => Number(x.id)),
    nextIndex: sent.length,
  });

  if (limited.length > sent.length) {
    await ctx.reply(`➡️ Є ще ${limited.length - sent.length} варіантів. Напишіть: "ще" або "дай ще 3"`);
  } else {
    await ctx.reply("✅ Це всі знайдені варіанти за цим запитом.");
  }

  return limited;
}
`;

if (!s.includes('async function handleExactNoteQueryEarlyV9')) {
  const helperMarkers = [
    'function createRelaxedSearchProfile',
    'function runFullDbSearch',
    'function extractUsefulTokens',
  ];
  let inserted = false;
  for (const marker of helperMarkers) {
    const idx = s.indexOf(marker);
    if (idx >= 0) {
      s = s.slice(0, idx) + helper + '\n' + s.slice(idx);
      inserted = true;
      break;
    }
  }
  if (!inserted) console.warn('Could not insert handleExactNoteQueryEarlyV9 helper automatically.');
}

// 4) Put exact-note handler BEFORE direct search / AI. This is the important fix.
const call = `  // V9_EXACT_NOTE_BEFORE_DIRECT
  const exactNoteHandledV9 = await handleExactNoteQueryEarlyV9(ctx, userText, progressMsg);
  if (exactNoteHandledV9) return true;
`;

if (!s.includes('V9_EXACT_NOTE_BEFORE_DIRECT')) {
  const patterns = [
    /\n\s*const\s+directSearchStartedAt\s*=\s*Date\.now\(\);/,
    /\n\s*const\s+directStart\s*=\s*Date\.now\(\);/,
    /\n\s*const\s+useDirectSearch\s*=\s*shouldUseDirectNameSearch\(userText\);/,
    /\n\s*const\s+shouldDirectSearch\s*=\s*shouldUseDirectNameSearch\(userText\);/,
  ];
  let inserted = false;
  for (const re of patterns) {
    if (insertBeforeRegex(re, call)) {
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    // Fallback: after progress step 3.
    const progressPatterns = [
      /await updateProgressMessage\([\s\S]*?3\/7 Перевіряю keywords \/ опис \/ ноти[\s\S]*?\);/,
      /await updateProgressMessage\([\s\S]*?3\/7[\s\S]*?ноти[\s\S]*?\);/,
    ];
    for (const re of progressPatterns) {
      const m = s.match(re);
      if (m) {
        s = s.replace(m[0], `${m[0]}\n\n${call}`);
        inserted = true;
        break;
      }
    }
  }

  if (!inserted) {
    console.warn('Could not auto-insert V9 exact-note call. Manual insert before direct search:');
    console.warn(call);
  }
}

fs.writeFileSync(file, s, 'utf8');
console.log('patched: src/flows/perfumeChatFlow.js');
console.log('Done. Run: CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkWatermelonExactV9.js');
