const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/flows/perfumeChatFlow.js');
if (!fs.existsSync(file)) {
  console.error('❌ Not found:', file);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
const marker = 'EXACT_NOTE_EARLY_FLOW_V13';

if (src.includes(marker)) {
  console.log('✅ Patch already exists in src/flows/perfumeChatFlow.js');
  process.exit(0);
}

const backup = `${file}.bak_exact_note_v13_${Date.now()}`;
fs.writeFileSync(backup, src, 'utf8');

const patch = `

/* =========================
   EXACT_NOTE_EARLY_FLOW_V13
   Exact note requests must be resolved BEFORE AI/profile/direct flow.
   Examples: кавун, диня, імбир, парфуми з нотою дині, шлейфовий з вишнею.
========================= */
async function __handleExactNoteEarlyFlowV13(ctx) {
  const text = String(ctx?.message?.text || '').trim();
  if (!text) return false;

  const lower = text.toLowerCase().trim();
  if (['ще', 'ще 3', 'дай ще', 'дай ще 3', 'more'].includes(lower)) return false;

  // Do not intercept text outside perfume-pick mode.
  try {
    if (typeof getMode === 'function' && getMode(ctx) !== 'pick') return false;
  } catch {}

  let parseLocalQuery;
  let findExactNoteMatches;

  try {
    ({ parseLocalQuery } = require('../search/queryNormalizer'));
    ({ findExactNoteMatches } = require('../search/exactNoteSearch'));
  } catch (e) {
    console.error('[EXACT_NOTE_EARLY_FLOW_V13] require failed:', e?.message || e);
    return false;
  }

  const local = parseLocalQuery(text);
  const hasExplicitNote = Boolean(
    local?.isExplicitNoteQuery ||
    (Array.isArray(local?.explicitNotes) && local.explicitNotes.length)
  );

  if (!hasExplicitNote) return false;

  const requestedGender =
    (typeof detectGenderFromText === 'function' ? detectGenderFromText(text) : null) ||
    local?.gender ||
    null;

  const started = Date.now();
  const matches = findExactNoteMatches(text, {
    limit: Number(process.env.SEARCH_LIMIT_CANDIDATES || 30),
    gender: requestedGender,
  });

  if (!Array.isArray(matches) || !matches.length) {
    console.log('[EXACT_NOTE_EARLY_FLOW_V13] no exact note matches, continue original flow', {
      text,
      explicitNotes: local?.explicitNotes || [],
      ms: Date.now() - started,
    });
    return false;
  }

  const items = typeof uniqById === 'function' ? uniqById(matches) : matches;
  const batchSize = Math.max(1, Number(process.env.SEARCH_TOP_K || SEARCH?.TOP_K || 3));
  const firstBatch = items.slice(0, batchSize);

  console.log('[EXACT_NOTE_EARLY_FLOW_V13] handled exact note query', {
    text,
    explicitNotes: local?.explicitNotes || [],
    requestedGender,
    found: items.length,
    ids: items.map((x) => x.id),
    ms: Date.now() - started,
  });

  try {
    await ctx.reply(
      '✅ Знайшов точні збіги по ноті в базі.\\n' +
      'Усього знайдено: ' + items.length + '.\\n' +
      'Спочатку показую аромати з цією нотою, без AI-підміни на загальний напрям.'
    );
  } catch {}

  if (typeof setLastSearch === 'function') {
    setLastSearch(ctx, {
      query: text,
      items,
      offset: firstBatch.length,
      source: 'exact_note_v13',
      requestedGender,
    });
  }

  if (typeof sendItemsBatch === 'function') {
    await sendItemsBatch(ctx, firstBatch);
  }

  const remaining = Math.max(0, items.length - firstBatch.length);
  if (remaining > 0) {
    await ctx.reply('➡️ Є ще ' + remaining + ' варіантів. Напишіть: "ще" або "дай ще 3"');
  } else {
    await ctx.reply('✅ Це всі знайдені варіанти за цією точною нотою.');
  }

  return true;
}

if (typeof onUserText === 'function') {
  const __originalOnUserTextExactNoteV13 = onUserText;
  module.exports.onUserText = async function onUserTextExactNoteV13(ctx) {
    const handled = await __handleExactNoteEarlyFlowV13(ctx);
    if (handled) return true;
    return __originalOnUserTextExactNoteV13(ctx);
  };
}
`;

src += patch;
fs.writeFileSync(file, src, 'utf8');
console.log('backup:', backup);
console.log('patched:', file);
console.log('Now run: grep -R "EXACT_NOTE_EARLY_FLOW_V13\\|findExactNoteMatches" -n src/flows/perfumeChatFlow.js src/search/exactNoteSearch.js');
