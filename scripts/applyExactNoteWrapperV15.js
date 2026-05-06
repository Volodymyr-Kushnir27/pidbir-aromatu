const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'flows', 'perfumeChatFlow.js');
if (!fs.existsSync(file)) {
  console.error('❌ Not found:', file);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
const marker = 'EXACT_NOTE_RUNTIME_WRAPPER_V15';

if (src.includes(marker)) {
  console.log('✅ Already patched:', marker);
  process.exit(0);
}

const backup = `${file}.bak_exact_note_v15_${Date.now()}`;
fs.writeFileSync(backup, src);
console.log('backup:', backup);

const wrapper = `

/* =========================
   EXACT_NOTE_RUNTIME_WRAPPER_V15
   Exact-note search is executed BEFORE the AI/profile flow for explicit note requests.
   This wrapper is intentionally appended after module.exports so it cannot miss anchors inside the file.
========================= */
try {
  const { findExactNoteMatches: __findExactNoteMatchesV15 } = require("../search/exactNoteSearch");
  const { parseLocalQuery: __parseLocalQueryV15 } = require("../search/queryNormalizer");

  const __originalOnUserTextV15 = module.exports.onUserText;

  function __noteTextV15(ctx) {
    return String(ctx?.message?.text || "").trim();
  }

  function __isMoreTextV15(text) {
    const t = norm(text);
    return /^(ще|еще|more|дай ще|дай еще|дай ще 3|дай еще 3)$/.test(t);
  }

  function __hasNoteIntentMarkerV15(text) {
    const t = norm(text);
    return /(^|\\s)(нота|нотою|ноти|нотами|з нотою|з нотою|з нотою|з запахом|з ароматом|із запахом|со вкусом|с запахом|with note|note of)(\\s|$)/i.test(t)
      || /(^|\\s)(аромат|парфум|парфуми|духи)(\\s+з|\\s+із|\\s+с|\\s+со)\b/i.test(t);
  }

  function __isSingleLikelyNoteV15(text) {
    const clean = norm(text)
      .replace(/[!?,.;:\\[\\](){}"'“”‘’]+/g, " ")
      .replace(/\\s+/g, " ")
      .trim();
    if (!clean) return false;
    const parts = clean.split(" ").filter(Boolean);
    return parts.length <= 2;
  }

  function __shouldRunExactNoteV15(text) {
    if (!text || text.startsWith('/')) return false;
    if (__isMoreTextV15(text)) return false;

    try {
      const local = __parseLocalQueryV15(text);
      if (local?.isExplicitNoteQuery) return true;
      if (Array.isArray(local?.explicitNotes) && local.explicitNotes.length) return true;
    } catch {}

    if (__hasNoteIntentMarkerV15(text)) return true;
    if (__isSingleLikelyNoteV15(text)) return true;

    return false;
  }

  async function __sendExactNotePageV15(ctx, state) {
    const batchSize = Number(process.env.SEARCH_TOP_K || 3) || 3;
    const offset = Number(state.offset || 0);
    const items = Array.isArray(state.items) ? state.items : [];
    const page = items.slice(offset, offset + batchSize);

    if (!page.length) {
      await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
      return true;
    }

    await sendItemsBatch(ctx, page);

    const nextOffset = offset + page.length;
    const remaining = Math.max(0, items.length - nextOffset);

    setLastSearch(ctx, {
      ...state,
      kind: 'exact_note_v15',
      offset: nextOffset,
    });

    if (remaining > 0) {
      await ctx.reply("➡️ Є ще ${remaining} варіантів. Напишіть: "ще" або "дай ще 3");
    } else {
      await ctx.reply('✅ Це всі знайдені варіанти за цим запитом.');
    }

    return true;
  }

  module.exports.onUserText = async function exactNoteWrappedOnUserTextV15(ctx) {
    const text = __noteTextV15(ctx);

    if (__isMoreTextV15(text)) {
      const last = getLastSearch(ctx);
      if (last?.kind === 'exact_note_v15') {
        return __sendExactNotePageV15(ctx, last);
      }
    }

    // Only in perfume pick mode. This avoids intercepting admin/user service text outside search mode.
    const currentMode = getMode(ctx);
    if (currentMode === 'pick' && __shouldRunExactNoteV15(text)) {
      const requestedGender = detectGenderFromText(text);
      const exactMatchesRaw = __findExactNoteMatchesV15(text, {
        limit: Number(process.env.SEARCH_LIMIT_CANDIDATES || 30) || 30,
        requestedGender,
      });

      const exactMatches = uniqById(exactMatchesRaw || []).map((item) => ({
        ...item,
        why_selected:
          Array.isArray(item.why_selected) && item.why_selected.length
            ? item.why_selected
            : ['точний збіг ноти у полі "ноти"'],
      }));

      if (exactMatches.length > 0) {
        try { incrementSearchCounterForActor(ctx); } catch {}

        await ctx.reply(
          "✅ Знайшов точні збіги по ноті в базі.\\nУсього знайдено: ${exactMatches.length}."
        );

        setLastSearch(ctx, {
          kind: 'exact_note_v15',
          query: text,
          items: exactMatches,
          offset: 0,
        });

        return __sendExactNotePageV15(ctx, getLastSearch(ctx));
      }
    }

    return __originalOnUserTextV15(ctx);
  };

  console.log('[perfumeChatFlow] EXACT_NOTE_RUNTIME_WRAPPER_V15 enabled');
} catch (e) {
  console.error('[perfumeChatFlow] EXACT_NOTE_RUNTIME_WRAPPER_V15 failed:', e?.message || e);
}
`;

src = src + wrapper;
fs.writeFileSync(file, src);
console.log('patched: src/flows/perfumeChatFlow.js');
console.log('Now run: grep -R "EXACT_NOTE_RUNTIME_WRAPPER_V15\\|findExactNoteMatches" -n src/flows/perfumeChatFlow.js src/search/exactNoteSearch.js');
