const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/flows/perfumeChatFlow.js');
if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

let s = fs.readFileSync(file, 'utf8');
const backup = `${file}.bak_exact_note_v12_${Date.now()}`;
fs.writeFileSync(backup, s);
console.log('backup:', backup);

function ensureImport(after, code) {
  if (s.includes(code.trim())) return;
  const idx = s.indexOf(after);
  if (idx === -1) throw new Error(`Cannot find import anchor: ${after}`);
  s = s.slice(0, idx + after.length) + '\n' + code + s.slice(idx + after.length);
}

ensureImport(
  'const { findCandidates } = require("../search/candidateSearch");',
  'const { parseLocalQuery } = require("../search/queryNormalizer");\nconst { findExactNoteMatches } = require("../search/exactNoteSearch");'
);

// Direct-search must not intercept note queries.
const fnNeedle = 'function shouldUseDirectNameSearch(text) {';
const fnIdx = s.indexOf(fnNeedle);
if (fnIdx >= 0 && !s.slice(fnIdx, fnIdx + 2500).includes('V12_EXACT_NOTE_DIRECT_BYPASS')) {
  const pos = fnIdx + fnNeedle.length;
  s = s.slice(0, pos) + `
  // V12_EXACT_NOTE_DIRECT_BYPASS
  try {
    const local = require("../search/queryNormalizer").parseLocalQuery(text);
    if (local?.isExplicitNoteQuery || (local?.explicitNotes || []).length) return false;
  } catch {}
` + s.slice(pos);
}

const helper = `

async function handleExactNoteQueryEarlyV12(ctx, userText, progressMsg) {
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
    `✅ Знайшов точні збіги по ноті в базі.\nУсього знайдено: ${noteItems.length}.\nПоказую спочатку аромати, де ця нота реально є в полі \"ноти\".`
  );

  const ordered = typeof buildRandomGenderOrderedList === "function"
    ? buildRandomGenderOrderedList(noteItems, local.gender || null)
    : sortByScore(noteItems);

  const limited = uniqById(ordered).slice(0, limit);
  const topK = Number(SEARCH.TOP_K || process.env.SEARCH_TOP_K || 3);
  const firstBatch = limited.slice(0, topK);

  const noteLabel = (local.explicitNoteDetails || [])
    .map((x) => (x.terms || [])[0] || x.canonical)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");

  await ctx.reply(`✨ Знайшов ${limited.length} варіант(ів) за точною нотою${noteLabel ? `: ${noteLabel}` : ""}.`);

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

if (!s.includes('async function handleExactNoteQueryEarlyV12')) {
  const idx = s.indexOf('function runFullDbSearch');
  if (idx === -1) throw new Error('Cannot insert helper: function runFullDbSearch not found');
  s = s.slice(0, idx) + helper + '\n' + s.slice(idx);
}

const call = `  // V12_EXACT_NOTE_BEFORE_DIRECT_AND_AI
  const exactNoteHandledV12 = await handleExactNoteQueryEarlyV12(ctx, userText, progressMsg);
  if (exactNoteHandledV12) return true;
`;

if (!s.includes('V12_EXACT_NOTE_BEFORE_DIRECT_AND_AI')) {
  const patterns = [
    /\n\s*const\s+directSearchStartedAt\s*=\s*Date\.now\(\);/,
    /\n\s*const\s+directStart\s*=\s*Date\.now\(\);/,
    /\n\s*const\s+useDirectSearch\s*=\s*shouldUseDirectNameSearch\(userText\);/,
    /\n\s*const\s+shouldDirectSearch\s*=\s*shouldUseDirectNameSearch\(userText\);/,
  ];
  let inserted = false;
  for (const re of patterns) {
    const m = s.match(re);
    if (m && typeof m.index === 'number') {
      s = s.slice(0, m.index) + '\n' + call + s.slice(m.index);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    const progressRe = /await updateProgressMessage\([\s\S]*?3\/7[\s\S]*?ноти[\s\S]*?\);/;
    const m = s.match(progressRe);
    if (m && typeof m.index === 'number') {
      const pos = m.index + m[0].length;
      s = s.slice(0, pos) + '\n\n' + call + s.slice(pos);
      inserted = true;
    }
  }

  if (!inserted) {
    throw new Error('Cannot auto-insert V12 exact note call. Need manual insert before direct search / AI.');
  }
}

fs.writeFileSync(file, s, 'utf8');
console.log('patched: src/flows/perfumeChatFlow.js');
console.log('V12 exact-note early flow inserted.');
