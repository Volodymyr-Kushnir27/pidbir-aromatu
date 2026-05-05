const fs = require("fs");
const path = require("path");

const flowPath = path.join(process.cwd(), "src", "flows", "perfumeChatFlow.js");

if (!fs.existsSync(flowPath)) {
  console.error("❌ Не знайшов src/flows/perfumeChatFlow.js");
  process.exit(1);
}

let src = fs.readFileSync(flowPath, "utf8");

function replaceFunction(source, name, replacement) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) {
    throw new Error(`Не знайшов функцію ${name}`);
  }

  let i = source.indexOf("{", start);
  if (i === -1) throw new Error(`Не знайшов тіло функції ${name}`);

  let depth = 0;
  let end = -1;

  for (; i < source.length; i += 1) {
    const ch = source[i];

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) throw new Error(`Не зміг визначити кінець функції ${name}`);

  return source.slice(0, start) + replacement.trim() + "\n\n" + source.slice(end);
}

const shouldUseDirectNameSearchFn = `
function shouldUseDirectNameSearch(text) {
  const compact = String(text || "").trim().replace(/\\s+/g, "");

  // 1–20 символів → direct search у БД.
  // 21+ символів → AI-аналіз, потім повторний пошук у БД по AI terms.
  return compact.length > 0 && compact.length <= 20;
}
`;

src = replaceFunction(src, "shouldUseDirectNameSearch", shouldUseDirectNameSearchFn);

const buildAiDirectQueriesFn = `
function buildAiDirectQueries(originalText, analysis) {
  const out = [];

  const push = (value) => {
    const s = String(value || "").trim();
    if (!s) return;
    if (s.length < 2) return;
    if (s.length > 80) return;
    out.push(s);
  };

  push(originalText);

  push(analysis?.target_name);
  push(analysis?.brand);
  push(analysis?.corrected_query);
  push(analysis?.translated_query);
  push(analysis?.normalized_query);

  for (const x of safeArray(analysis?.search_terms)) push(x);
  for (const x of safeArray(analysis?.name_aliases)) push(x);
  for (const x of safeArray(analysis?.possible_names)) push(x);

  for (const x of safeArray(analysis?.notes_top)) push(x);
  for (const x of safeArray(analysis?.notes_heart)) push(x);
  for (const x of safeArray(analysis?.notes_base)) push(x);
  for (const x of safeArray(analysis?.accords)) push(x);
  for (const x of safeArray(analysis?.style)) push(x);

  return uniqStrings(out).slice(0, 24);
}
`;

if (!src.includes("function buildAiDirectQueries(")) {
  const marker = "function createRelaxedSearchProfile(";
  const idx = src.indexOf(marker);
  if (idx === -1) {
    throw new Error("Не знайшов місце для buildAiDirectQueries: createRelaxedSearchProfile");
  }

  src = src.slice(0, idx) + buildAiDirectQueriesFn.trim() + "\n\n" + src.slice(idx);
}

src = src.replace(
  /logStep\("direct search decision",\s*\{[\s\S]*?\n\s*\}\);/,
  `logStep("direct search decision", {
  text,
  ms: Date.now() - startedAt,
  useDirectSearch,
  compactLength: String(text || "").trim().replace(/\\s+/g, "").length,
});`
);

src = src.replace(
  /directMatches = searchByNameAndKeywords\(text,\s*\{[\s\S]*?\n\s*\}\);/,
  `directMatches = searchByNameAndKeywords(text, {
    limit: SEARCH.LIMIT_CANDIDATES || 100,
    minScore: 1200,
    scanLimit: 120,
  });`
);

const aiRetryBlock = `
    const aiDirectQueries = buildAiDirectQueries(text, analysis);

    logStep("AI direct retry queries", {
      text,
      ms: Date.now() - startedAt,
      aiDirectQueries,
    });

    if (aiDirectQueries.length) {
      const aiDirectMatches = [];

      for (const q of aiDirectQueries) {
        const found = searchByNameAndKeywords(q, {
          limit: SEARCH.LIMIT_CANDIDATES || 100,
          minScore: 1200,
          scanLimit: 120,
        });

        aiDirectMatches.push(...found);
      }

      const uniqueAiDirectMatches = uniqById(aiDirectMatches).sort((a, b) => {
        const diff = Number(b.match_score || 0) - Number(a.match_score || 0);
        if (diff !== 0) return diff;
        return Number(a.id || 0) - Number(b.id || 0);
      });

      logStep("AI direct retry result", {
        text,
        ms: Date.now() - startedAt,
        count: uniqueAiDirectMatches.length,
        first: uniqueAiDirectMatches.slice(0, 5).map((x) => ({
          id: x.id,
          name: x.name,
          score: x.match_score,
          field: x.direct_match_field,
          type: x.direct_match_type,
        })),
      });

      if (hasStrongDirectMatch(uniqueAiDirectMatches)) {
        clearLastSearch(ctx);

        const firstBatch = uniqueAiDirectMatches.slice(0, 3);

        await updateProgressMessage(
          ctx,
          progressMsg,
          [
            \`✅ AI-підбір завершено за \${formatMs(Date.now() - startedAt)}\`,
            "",
            "AI розібрав запит і знайшов збіги в базі по назві / ключових словах.",
            \`Усього знайдено: \${uniqueAiDirectMatches.length}\`,
          ].join("\\n"),
        );

        await ctx.reply(
          \`✅ AI розібрав запит і знайшов \${uniqueAiDirectMatches.length} варіанти в базі.\\n\\nСпочатку показую найсильніші збіги.\`,
        );

        const { sent, failed } = await sendItemsBatch(ctx, firstBatch);

        if (failed.length) {
          console.error(
            "AI direct retry failed items:",
            failed.map((x) => ({ id: x.id, name: x.name })),
          );
        }

        const sentIds = sent.map((x) => x.id);

        setLastSearch(ctx, {
          query: text,
          analysis,
          searchProfile: null,
          requestedGender: null,
          searchMode: "ai_direct_retry",
          approximate: false,

          primaryItems: uniqueAiDirectMatches,
          fallbackItems: [],
          sentIds,
          offset: sentIds.length,
        });

        const left = uniqueAiDirectMatches.length - sentIds.length;

        if (left > 0) {
          await ctx.reply(
            \`➡️ Є ще \${left} варіантів. Напишіть: "ще" або "дай ще 3"\`,
          );
        } else {
          await ctx.reply("✅ Це всі знайдені варіанти за цим запитом.");
        }

        logStep("completed by AI direct retry", {
          text,
          ms: Date.now() - startedAt,
          total: uniqueAiDirectMatches.length,
        });

        return true;
      }
    }
`;

if (!src.includes('logStep("AI direct retry queries"')) {
  const afterAnalyzeRegex = /logStep\("after analyzePerfumeIntent",\s*\{[\s\S]*?\n\s*\}\);\n/;
  const m = src.match(afterAnalyzeRegex);

  if (!m) {
    throw new Error('Не знайшов блок logStep("after analyzePerfumeIntent") для вставки AI retry');
  }

  src = src.replace(afterAnalyzeRegex, m[0] + aiRetryBlock + "\n");
}

fs.writeFileSync(flowPath, src, "utf8");

console.log("✅ perfumeChatFlow.js patched:");
console.log("- direct search <= 20 compact chars");
console.log("- AI direct retry after analyzePerfumeIntent");
console.log("- direct search scanLimit = 120");
