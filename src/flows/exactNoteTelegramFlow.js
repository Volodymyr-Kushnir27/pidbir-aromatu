const { findExactNoteMatches } = require('../search/exactNoteSearch');
const { getAllPerfumes } = require('../search/catalogRepo');
const { sendPerfumeCard } = require('./sendPerfumeCard');

const exactNoteState = new Map();

const SEARCH_LIMIT = Math.min(Number(process.env.SEARCH_LIMIT_CANDIDATES || 30) || 30, 30);
const PAGE_SIZE = Math.max(1, Number(process.env.SEARCH_TOP_K || 3) || 3);

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ʼ’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGenderValue(value) {
  const t = norm(value);
  if (!t) return 'unknown';
  if (/унісекс|унисекс|unisex|ніша,\s*унісекс/.test(t)) return 'unisex';
  if (/жіноч|жноч|женск|female|woman|women/.test(t)) return 'female';
  if (/чолов|мужск|male|man|men/.test(t)) return 'male';
  return 'unknown';
}

function detectGenderFromText(text) {
  const t = norm(text);
  if (/\b(унісекс|унісексові|унисекс|unisex|для всіх|для всех)\b/i.test(t)) return 'unisex';
  if (/\b(жіночі|жіночий|жіноче|для жінки|для жінок|для дівчини|дівочі|женские|женский|для женщины|для женщин|female|woman|women)\b/i.test(t)) return 'female';
  if (/\b(чоловічі|чоловічий|чоловіче|для чоловіка|для чоловіків|для хлопця|мужские|мужской|для мужчины|для мужчин|male|man|men)\b/i.test(t)) return 'male';
  return null;
}

function genderAllowed(rowGender, requestedGender) {
  const req = normalizeGenderValue(requestedGender);
  const item = normalizeGenderValue(rowGender);
  if (!req || req === 'unknown') return true;
  if (req === 'female') return item === 'female' || item === 'unisex';
  if (req === 'male') return item === 'male' || item === 'unisex';
  if (req === 'unisex') return item === 'unisex';
  return true;
}

function isMoreText(text) {
  const t = norm(text);
  return /^(ще|еще|more|дай ще|дай еще|дай ще 3|дай еще 3)$/i.test(t);
}

function getTgId(ctx) {
  return Number(ctx?.from?.id || 0);
}

function uniqById(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const id = Number(item?.id || 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function wordBoundaryContains(text, term) {
  const t = norm(text).replace(/[^a-zа-яіїєґ0-9'\s]+/giu, ' ');
  const needle = norm(term).replace(/[^a-zа-яіїєґ0-9'\s]+/giu, ' ').trim();
  if (!needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp('(^|[^a-zа-яіїєґ0-9])' + esc + '($|[^a-zа-яіїєґ0-9])', 'iu').test(t);
}

const ALIAS_GROUPS = [
  ['кавун', 'кавуна', 'кавуну', 'кавуном', 'арбуз', 'арбуза', 'арбузу', 'watermelon', 'water melon'],
  ['диня', 'дині', 'диню', 'динею', 'дыня', 'дыни', 'дыню', 'melon'],
  ['імбир', 'імбиру', 'імбиром', 'імбирь', 'имбир', 'имбирь', 'ginger'],
  ['полуниця', 'полуниці', 'полуницю', 'полуницею', 'клубника', 'клубники', 'клубнику', 'strawberry'],
  ['маракуя', 'маракуї', 'маракую', 'маракуєю', 'passion fruit', 'passionfruit'],
  ['базилік', 'базиліку', 'базиліком', 'базилик', 'базилика', 'basil'],
  ['слива', 'сливи', 'сливу', 'сливою', 'plum'],
  ['мед', 'меду', 'медом', 'медовий', 'honey'],
  ['фіалка', 'фіалки', 'фіалку', 'фіалкою', 'фиалка', 'violet'],
  ['мята', "м'ята", 'мʼята', 'м’ята', 'мяти', "м'яти", 'мятою', "м'ятою", 'mint'],
  ['вишня', 'вишні', 'вишню', 'вишнею', 'черешня', 'cherry'],
  ['ром', 'рому', 'ромом', 'rum'],
  ['віскі', 'виски', 'whisky', 'whiskey', 'bourbon', 'scotch'],
];

const STOP_WORDS = new Set([
  'аромат', 'аромату', 'аромати', 'парфум', 'парфуми', 'духи', 'нота', 'ноти', 'нотою', 'нотами',
  'з', 'із', 'с', 'со', 'та', 'і', 'й', 'або', 'чи', 'для', 'мені', 'підбери', 'знайди', 'дай',
  'шлейфовий', 'стійкий', 'свіжий', 'солодкий', 'жіночий', 'жіночі', 'чоловічий', 'чоловічі', 'унісекс'
]);

function extractCandidateTerms(text) {
  const cleaned = norm(text).replace(/[^a-zа-яіїєґ0-9'\s]+/giu, ' ');
  const words = cleaned.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const base = words.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const terms = new Set(base);

  for (const group of ALIAS_GROUPS) {
    if (group.some((alias) => base.some((w) => wordBoundaryContains(w, alias) || wordBoundaryContains(alias, w)))) {
      for (const alias of group) terms.add(alias);
    }
  }

  return [...terms].filter((x) => x.length >= 3).slice(0, 40);
}

function fallbackFindByNotes(text, requestedGender) {
  const terms = extractCandidateTerms(text);
  if (!terms.length) return [];

  const rows = getAllPerfumes(3000).filter((row) => genderAllowed(row.gender, requestedGender));
  const found = [];

  for (const row of rows) {
    const notes = String(row.notes || '');
    if (!notes.trim()) continue;

    const matched = terms.filter((term) => wordBoundaryContains(notes, term));
    if (!matched.length) continue;

    const g = normalizeGenderValue(row.gender);
    const score = 30000 + matched.length * 1000 + (g === 'unisex' ? 200 : 0) - Number(row.id || 0) * 0.01;
    found.push({
      ...row,
      match_score: Math.max(Number(row.match_score || 0), score),
      match_bucket: 'exact_note_runtime',
      direct_match_field: 'ноти',
      direct_match_type: 'exact_note_runtime',
      why_selected: ['точний збіг ноти у полі "ноти": ' + [...new Set(matched)].slice(0, 5).join(', ')],
    });
  }

  return found.sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0)).slice(0, SEARCH_LIMIT);
}

async function sendPage(ctx, state) {
  const offset = Number(state.offset || 0);
  const items = Array.isArray(state.items) ? state.items : [];
  const page = items.slice(offset, offset + PAGE_SIZE);

  if (!page.length) {
    await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
    return true;
  }

  for (const item of page) {
    await sendPerfumeCard(ctx, item, { notes: true, season: false });
  }

  const nextOffset = offset + page.length;
  const remaining = Math.max(0, items.length - nextOffset);
  exactNoteState.set(getTgId(ctx), { ...state, offset: nextOffset });

  if (remaining > 0) {
    await ctx.reply('➡️ Є ще ' + remaining + ' варіантів. Напишіть: "ще" або "дай ще 3"');
  } else {
    await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
  }

  return true;
}

async function onExactNoteText(ctx) {
  const text = String(ctx?.message?.text || '').trim();
  const tgId = getTgId(ctx);
  if (!tgId || !text || text.startsWith('/')) return false;

  if (isMoreText(text)) {
    const state = exactNoteState.get(tgId);
    if (state) return sendPage(ctx, state);
    return false;
  }

  const requestedGender = detectGenderFromText(text);
  let matches = [];

  try {
    matches = findExactNoteMatches(text, {
      limit: SEARCH_LIMIT,
      gender: requestedGender,
      requestedGender,
    }) || [];
  } catch (e) {
    console.error('[exactNoteTelegramFlow] findExactNoteMatches failed:', e?.message || e);
  }

  const fallback = fallbackFindByNotes(text, requestedGender);
  const all = uniqById([...fallback, ...matches])
    .sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0))
    .slice(0, SEARCH_LIMIT);

  if (!all.length) return false;

  if (process.env.SEARCH_DEBUG === '1') {
    console.log('[exactNoteTelegramFlow] intercepted', {
      text,
      exact: matches.length,
      fallback: fallback.length,
      returned: all.length,
      codes: all.map((x) => x.number_code),
    });
  }

  await ctx.reply('✅ Знайшов точні збіги по ноті в базі.\nУсього знайдено: ' + all.length + '.');

  exactNoteState.set(tgId, {
    kind: 'exact_note_router_v16',
    query: text,
    items: all,
    offset: 0,
  });

  return sendPage(ctx, exactNoteState.get(tgId));
}

module.exports = {
  onExactNoteText,
};
