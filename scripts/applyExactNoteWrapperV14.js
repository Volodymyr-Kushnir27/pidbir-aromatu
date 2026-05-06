const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'flows', 'perfumeChatFlow.js');
if (!fs.existsSync(file)) {
  console.error('❌ File not found:', file);
  process.exit(1);
}

let src = fs.readFileSync(file, 'utf8');
const marker = 'EXACT_NOTE_RUNTIME_WRAPPER_V14';
if (src.includes(marker)) {
  console.log('✅ Already patched:', file);
  process.exit(0);
}

if (!src.includes('module.exports') || !src.includes('onUserText')) {
  console.error('❌ Cannot find module.exports / onUserText in perfumeChatFlow.js');
  process.exit(1);
}

const block = String.raw`

/* =========================
   EXACT_NOTE_RUNTIME_WRAPPER_V14
   ВАЖЛИВО: цей wrapper стоїть ПІСЛЯ module.exports і перехоплює нотні запити
   ДО того, як старий onUserText піде в AI/profile/direct fallback.
========================= */
try {
  const __originalOnUserTextV14 = module.exports.onUserText;

  if (typeof __originalOnUserTextV14 === "function") {
    module.exports.onUserText = async function exactNoteRuntimeWrapperV14(ctx) {
      const text = String(ctx?.message?.text || "").trim();

      // Не чіпаємо службові команди і неактивний режим підбору.
      if (!text || text.startsWith("/")) {
        return __originalOnUserTextV14(ctx);
      }

      try {
        const currentMode = typeof getMode === "function" ? getMode(ctx) : null;
        if (currentMode && currentMode !== "pick") {
          return __originalOnUserTextV14(ctx);
        }

        const { findExactNoteMatches } = require("../search/exactNoteSearch");
        const requestedGender =
          typeof detectGenderFromText === "function" ? detectGenderFromText(text) : null;

        const limit = Number(process.env.SEARCH_LIMIT_CANDIDATES || 30);
        const exactMatches = findExactNoteMatches(text, {
          limit,
          requestedGender,
          notesOnlyFirst: true,
        });

        if (Array.isArray(exactMatches) && exactMatches.length > 0) {
          const items = typeof uniqById === "function" ? uniqById(exactMatches) : exactMatches;
          const firstBatchSize = Number(process.env.SEARCH_TOP_K || 3);
          const firstBatch = items.slice(0, firstBatchSize);

          await ctx.reply(
            "✅ Знайшов точні збіги по ноті в базі.\nУсього знайдено: ${items.length}."
          );

          const result =
            typeof sendItemsBatch === "function"
              ? await sendItemsBatch(ctx, firstBatch)
              : { sent: firstBatch, failed: [] };

          const sentCount = Array.isArray(result?.sent) ? result.sent.length : firstBatch.length;

          if (typeof setLastSearch === "function") {
            setLastSearch(ctx, {
              query: text,
              source: "exact_note_v14",
              items,
              allItems: items,
              shown: sentCount,
              offset: sentCount,
              nextOffset: sentCount,
              requestedGender,
              createdAt: Date.now(),
            });
          }

          const left = Math.max(items.length - sentCount, 0);
          if (left > 0) {
            await ctx.reply(ʼ"➡️ Є ще ${left} варіантів. Напишіть: "ще" або "дай ще 3");
          } else {
            await ctx.reply("✅ Це всі знайдені варіанти за цим запитом.");
          }

          return true;
        }
      } catch (e) {
        console.error("[EXACT_NOTE_RUNTIME_WRAPPER_V14] failed:", e?.message || e);
      }

      return __originalOnUserTextV14(ctx);
    };

    console.log("✅ EXACT_NOTE_RUNTIME_WRAPPER_V14 enabled");
  } else {
    console.error("❌ EXACT_NOTE_RUNTIME_WRAPPER_V14: module.exports.onUserText is not a function");
  }
} catch (e) {
  console.error("❌ EXACT_NOTE_RUNTIME_WRAPPER_V14 init failed:", e?.message || e);
}
`;

const backup = file + `.bak_exact_note_v14_${Date.now()}`;
fs.copyFileSync(file, backup);
fs.writeFileSync(file, src + block, 'utf8');
console.log('backup:', backup);
console.log('patched:', file);
console.log('Now run: grep -R "EXACT_NOTE_RUNTIME_WRAPPER_V14\\|findExactNoteMatches" -n src/flows/perfumeChatFlow.js src/search/exactNoteSearch.js');
