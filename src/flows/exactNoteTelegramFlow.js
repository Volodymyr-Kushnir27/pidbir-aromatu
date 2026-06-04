const { findExactNoteMatches } = require('../search/exactNoteSearch');
const { sendPerfumeCard } = require('./sendPerfumeCard');

const exactNoteState = new Map();
const BATCH_SIZE = 3;
const MAX_EXACT_NOTE_RESULTS = Number(process.env.EXACT_NOTE_RESULT_LIMIT || process.env.SEARCH_LIMIT_CANDIDATES || 30);

function getTgId(ctx) {
  return ctx.from?.id;
}

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ʼ’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return norm(text)
    .replace(/["“”«»()[\]{}.,;:!?/\\|+=*_~№#@$%^&-]+/g, ' ')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isMoreRequest(text) {
  const t = norm(text);
  return /^(ще|ещё|еще|дай ще|дай ще 3|покажи ще|ще 3|more)$/i.test(t);
}

function hasNoteIntent(text) {
  const t = norm(text);

  if (/\b(нота|нотою|нотой|нотой|ноти|нотами|notes?|запах|запахом|аромат з|парфум з|парфуми з|духи з|духи с|парфюм с|аромат с)\b/i.test(t)) {
    return true;
  }

  // Фрази типу "шлейфовий з вишнею", "солодкий з полуницею".
  if (/\bз\s+[а-яіїєґ'’ʼa-z]{3,}\b/i.test(t) || /\bс\s+[а-яіїєґ'’ʼa-z]{3,}\b/i.test(t)) {
    return true;
  }

  return false;
}

function looksLikeShortNoteQuery(text) {
  const tokens = tokenize(text).filter((x) => !['аромат', 'парфум', 'парфуми', 'духи', 'підбери', 'знайди', 'давай', 'мені', 'хочу'].includes(x));
  return tokens.length >= 1 && tokens.length <= 3;
}

function hasBrandLikeWords(text) {
  const t = norm(text);
  return /\b(tom|ford|том|форд|paco|rabanne|пако|рабан|creed|крид|chanel|шанель|versace|версаче|escada|ескада|zara|dolce|gabbana|габана|dior|діор|armani|армані|ysl|laurent|montale|монталь|kilian|кіліан|byredo|байредо|mancera|мансера|hugo|boss|hormone|gaba)\b/i.test(t);
}

function shouldTryExactNote(text) {
  const t = norm(text);
  if (!t || t.startsWith('/')) return false;
  if (isMoreRequest(t)) return true;

  // Не перехоплюємо очевидний пошук бренду/назви без нотного наміру.
  if (hasBrandLikeWords(t) && !hasNoteIntent(t)) return false;

  return hasNoteIntent(t) || looksLikeShortNoteQuery(t);
}

function getRequestedGender(text) {
  const t = norm(text);
  if (/\b(унісекс|унисекс|unisex|для всіх|для всех)\b/i.test(t)) return 'unisex';
  if (/\b(жіночі|жіночий|жіноче|жінки|жінок|дівчини|женские|женский|женщины|женщин|female|women|woman)\b/i.test(t)) return 'female';
  if (/\b(чоловічі|чоловічий|чоловіче|чоловіка|чоловіків|мужские|мужской|мужчины|мужчин|male|men|man)\b/i.test(t)) return 'male';
  return null;
}

function buildExactNotePayload(item) {
  const why = Array.isArray(item.why_selected) ? item.why_selected : [];
  const hasExactWhy = why.some((x) => String(x || '').toLowerCase().includes('точний збіг'));

  return {
    ...item,
    why_selected: hasExactWhy ? why : [`точний збіг ноти у полі "Ноти"`],
  };
}

async function sendExactBatch(ctx, items, offset = 0) {
  const batch = items.slice(offset, offset + BATCH_SIZE);
  for (const item of batch) {
    await sendPerfumeCard(ctx, buildExactNotePayload(item), {
      notes: true,
      season: false,
    });
  }

  const nextOffset = offset + batch.length;
  const remaining = Math.max(items.length - nextOffset, 0);
  return { sent: batch.length, nextOffset, remaining };
}

async function handleMore(ctx, text) {
  if (!isMoreRequest(text)) return false;

  const tgId = getTgId(ctx);
  const state = tgId ? exactNoteState.get(tgId) : null;
  if (!state?.items?.length) return false;

  const { sent, nextOffset, remaining } = await sendExactBatch(ctx, state.items, state.offset || 0);
  if (!sent) {
    exactNoteState.delete(tgId);
    await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
    return true;
  }

  if (remaining > 0) {
    exactNoteState.set(tgId, { ...state, offset: nextOffset });
    await ctx.reply('➡️ Є ще ' + remaining + ' варіантів. Напишіть: "ще" або "дай ще 3"');
  } else {
    exactNoteState.delete(tgId);
    await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
  }

  return true;
}

async function onExactNoteText(ctx) {
  const text = String(ctx.message?.text || '').trim();
  const tgId = getTgId(ctx);

  if (!text || !tgId) return false;

  if (await handleMore(ctx, text)) return true;
  if (!shouldTryExactNote(text)) return false;

  const gender = getRequestedGender(text);
  let matches = [];

  try {
    matches = findExactNoteMatches(text, {
      gender,
      limit: MAX_EXACT_NOTE_RESULTS,
    });
  } catch (e) {
    console.error('[exactNoteTelegramFlow:v18] findExactNoteMatches failed:', e?.message || e);
    return false;
  }

  if (!Array.isArray(matches) || !matches.length) return false;

  exactNoteState.set(tgId, {
    text,
    items: matches,
    offset: 0,
  });

  await ctx.reply(
    '✅ Знайшов точні збіги по ноті в базі.\n' +
    'Усього знайдено: ' + matches.length + '.\n' +
    'Спочатку показую унісекс, потім жіночі/чоловічі за релевантністю.'
  );

  const { sent, nextOffset, remaining } = await sendExactBatch(ctx, matches, 0);

  if (!sent) {
    exactNoteState.delete(tgId);
    return false;
  }

  if (remaining > 0) {
    exactNoteState.set(tgId, { text, items: matches, offset: nextOffset });
    await ctx.reply('➡️ Є ще ' + remaining + ' варіантів. Напишіть: "ще" або "дай ще 3"');
  } else {
    exactNoteState.delete(tgId);
    await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
  }

  return true;
}

module.exports = {
  onExactNoteText,
};
