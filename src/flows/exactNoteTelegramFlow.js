const { findExactNoteMatches } = require('../search/exactNoteSearch');
const { sendPerfumeCard } = require('./sendPerfumeCard');

const PAGE_SIZE = Number(process.env.EXACT_NOTE_PAGE_SIZE || 3);
const MAX_RESULTS = Number(process.env.EXACT_NOTE_MAX_RESULTS || process.env.SEARCH_LIMIT_CANDIDATES || 30);
const exactNoteState = new Map();

function getTgId(ctx) {
  return ctx.from?.id;
}

function isMoreText(text) {
  const t = String(text || '').toLowerCase().trim();
  return /^(ще|ще\s*\d+|дай\s+ще|дай\s+ще\s*\d+|покажи\s+ще|далі|следующие|еще|more)$/i.test(t);
}

function getMoreCount(text) {
  const m = String(text || '').match(/\d+/);
  return m ? Math.max(1, Math.min(Number(m[0]), 10)) : PAGE_SIZE;
}

function setExactState(ctx, items, query) {
  const tgId = getTgId(ctx);
  if (!tgId) return;
  exactNoteState.set(tgId, { items, query, offset: 0, createdAt: Date.now() });
}

function getExactState(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return null;
  return exactNoteState.get(tgId) || null;
}

async function sendBatch(ctx, state, count = PAGE_SIZE) {
  const start = Number(state.offset || 0);
  const items = state.items.slice(start, start + count);

  for (const item of items) {
    await sendPerfumeCard(ctx, item, { notes: true, season: false });
  }

  state.offset = start + items.length;
  const remaining = state.items.length - state.offset;

  if (remaining > 0) {
    await ctx.reply('➡️ Є ще ' + remaining + ' варіантів. Напишіть: "ще" або "дай ще 3"');
  } else {
    await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
  }

  return true;
}

async function onExactNoteText(ctx) {
  const text = String(ctx.message?.text || '').trim();
  if (!text || text.startsWith('/')) return false;

  const prevState = getExactState(ctx);
  if (prevState && isMoreText(text)) {
    return sendBatch(ctx, prevState, getMoreCount(text));
  }

  let matches = [];
  try {
    matches = findExactNoteMatches(text, { limit: MAX_RESULTS });
  } catch (e) {
    console.error('[exactNoteTelegramFlow:v19] findExactNoteMatches failed:', e?.message || e);
    return false;
  }

  if (!Array.isArray(matches) || !matches.length) return false;

  setExactState(ctx, matches, text);
  const state = getExactState(ctx);

  await ctx.reply(
    '✅ Знайшов точні збіги по ноті в базі.\n' +
      'Усього знайдено: ' + matches.length + '.\n' +
      'Спочатку показую унісекс, далі — найближчі за релевантністю.'
  );

  return sendBatch(ctx, state, PAGE_SIZE);
}

module.exports = { onExactNoteText };
