const fs = require("fs");
const path = require("path");

const flowPath = path.join(process.cwd(), "src", "flows", "perfumeChatFlow.js");

if (!fs.existsSync(flowPath)) {
  console.error("❌ Не знайшов src/flows/perfumeChatFlow.js");
  process.exit(1);
}

let src = fs.readFileSync(flowPath, "utf8");

function insertAfter(source, needle, insert) {
  if (source.includes(insert.trim())) return source;
  const idx = source.indexOf(needle);
  if (idx === -1) throw new Error(`Не знайшов місце вставки після: ${needle}`);
  return source.slice(0, idx + needle.length) + "\n" + insert.trim() + source.slice(idx + needle.length);
}

// 1. Import web lookup
src = insertAfter(
  src,
  'const { writeReferencePerfumeIntro } = require("../llm/writeReferencePerfumeIntro");',
  '\nconst { lookupPerfumeOnWeb } = require("../llm/webPerfumeLookup");'
);

// 2. Helper mergeWebLookupIntoAnalysis
const helper = `
function mergeWebLookupIntoAnalysis(analysis, webPerfumeData) {
  if (!webPerfumeData?.found) return analysis;

  return {
    ...(analysis || {}),
    brand: webPerfumeData.brand || analysis?.brand || "",
    target_name: webPerfumeData.target_name || analysis?.target_name || "",
    normalized_query:
      webPerfumeData.normalized_name ||
      analysis?.normalized_query ||
      webPerfumeData.target_name ||
      "",
    query_type: analysis?.query_type || "reference_perfume",
    gender: webPerfumeData.gender || analysis?.gender || "unknown",

    seasons: uniqStrings([
      ...safeArray(analysis?.seasons),
      ...safeArray(webPerfumeData.seasons),
    ]),
    style: uniqStrings([
      ...safeArray(analysis?.style),
      ...safeArray(webPerfumeData.style),
    ]),
    notes_top: uniqStrings([
      ...safeArray(analysis?.notes_top),
      ...safeArray(webPerfumeData.notes_top),
    ]),
    notes_heart: uniqStrings([
      ...safeArray(analysis?.notes_heart),
      ...safeArray(webPerfumeData.notes_heart),
    ]),
    notes_base: uniqStrings([
      ...safeArray(analysis?.notes_base),
      ...safeArray(webPerfumeData.notes_base),
    ]),
    accords: uniqStrings([
      ...safeArray(analysis?.accords),
      ...safeArray(webPerfumeData.accords),
    ]),
    search_terms: uniqStrings([
      ...safeArray(analysis?.search_terms),
      ...safeArray(webPerfumeData.search_terms),
      webPerfumeData.brand,
      webPerfumeData.target_name,
      webPerfumeData.normalized_name,
    ]),
    possible_names: uniqStrings([
      ...safeArray(analysis?.possible_names),
      ...safeArray(webPerfumeData.possible_names),
      webPerfumeData.target_name,
    ]),
    name_aliases: uniqStrings([
      ...safeArray(analysis?.name_aliases),
      ...safeArray(webPerfumeData.name_aliases),
      webPerfumeData.normalized_name,
    ]),
  };
}
`;

if (!src.includes("function mergeWebLookupIntoAnalysis(")) {
  const marker = "function createRelaxedSearchProfile(";
  const idx = src.indexOf(marker);
  if (idx === -1) {
    throw new Error("Не знайшов createRelaxedSearchProfile для вставки helper");
  }
  src = src.slice(0, idx) + helper.trim() + "\n\n" + src.slice(idx);
}

// 3. Replace const analysis with let analysis if exists
src = src.replace(
  /const analysis = await withStepTimeout\(\s*analyzePerfumeIntent\(text\),/,
  "let analysis = await withStepTimeout(\n      analyzePerfumeIntent(text),"
);

// 4. Insert web lookup after after analyze log
const webBlock = `
    let webPerfumeData = null;

    if (
      analysis?.query_type === "reference_perfume" &&
      (analysis?.target_name || analysis?.brand || analysis?.normalized_query)
    ) {
      await updateProgressMessage(
        ctx,
        progressMsg,
        [
          "🔎 AI-підбір запущено...",
          "",
          "1/7 Код перевірено",
          "2/7 Запит розібрано",
          "3/7 Шукаю опис аромату в інтернеті",
        ].join("\\n"),
      );

      webPerfumeData = await withStepTimeout(
        lookupPerfumeOnWeb({ userText: text, analysis }),
        Number(process.env.WEB_LOOKUP_TIMEOUT_MS || 15000),
        "lookupPerfumeOnWeb",
      );

      logStep("after web perfume lookup", {
        text,
        ms: Date.now() - startedAt,
        found: Boolean(webPerfumeData?.found),
        brand: webPerfumeData?.brand,
        target_name: webPerfumeData?.target_name,
        notes_top: webPerfumeData?.notes_top,
        accords: webPerfumeData?.accords,
        sources: webPerfumeData?.source_urls,
      });

      if (webPerfumeData?.found) {
        analysis = mergeWebLookupIntoAnalysis(analysis, webPerfumeData);
      }
    }
`;

if (!src.includes('logStep("after web perfume lookup"')) {
  const re = /logStep\("after analyzePerfumeIntent",\s*\{[\s\S]*?\n\s*\}\);\n/;
  const match = src.match(re);

  if (!match) {
    throw new Error('Не знайшов logStep("after analyzePerfumeIntent")');
  }

  src = src.replace(re, match[0] + webBlock + "\n");
}

// 5. writeReferencePerfumeIntro should receive webPerfumeData
src = src.replace(
  /writeReferencePerfumeIntro\(\{\s*userText:\s*text,\s*analysis,\s*\}\)/g,
  "writeReferencePerfumeIntro({ userText: text, analysis, webPerfumeData })"
);

// 6. buildSearchProfile can receive webPerfumeData
src = src.replace(
  /buildSearchProfile\(analysis\)/g,
  "buildSearchProfile(analysis, webPerfumeData)"
);

fs.writeFileSync(flowPath, src, "utf8");

console.log("✅ perfumeChatFlow.js patched with web lookup:");
console.log("- added lookupPerfumeOnWeb import");
console.log("- web lookup after analyzePerfumeIntent");
console.log("- intro gets webPerfumeData");
console.log("- buildSearchProfile gets webPerfumeData");
