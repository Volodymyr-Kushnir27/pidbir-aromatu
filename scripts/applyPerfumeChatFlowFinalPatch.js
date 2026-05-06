#!/usr/bin/env node

/**
 * Safe final patch for src/flows/perfumeChatFlow.js
 *
 * It does not rewrite the whole huge file. It inserts:
 * - reference-name search after AI analysis/profile is ready;
 * - cap of candidate search to 30 where obvious patterns exist;
 * - direct search uses existing fast directNameKeywordSearch which cleans gender/intent words itself.
 *
 * If the script cannot patch automatically, it prints the exact block to paste manually.
 */

const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "src/flows/perfumeChatFlow.js");

if (!fs.existsSync(file)) {
  console.error("❌ File not found:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");
const backup = `${file}.backup-${Date.now()}`;
fs.writeFileSync(backup, src);

function insertAfterNeedle(source, needle, insert) {
  if (source.includes(insert.trim())) return source;
  const idx = source.indexOf(needle);
  if (idx === -1) return source;
  return source.slice(0, idx + needle.length) + "\n" + insert + source.slice(idx + needle.length);
}

// 1) Add imports.
src = insertAfterNeedle(
  src,
  `} = require("../search/directNameKeywordSearch");`,
  `
const {
  findReferenceNameMatches,
  hasStrongReferenceNameMatch,
} = require("../search/referenceNameSearch");
`
);

// 2) Add helper after filterAllowedGender if possible.
const helper = `
function capSearchLimit(value, fallback = 30) {
  const n = Number(value || fallback);
  return Math.min(Number.isFinite(n) ? n : fallback, 30);
}

async function trySendReferenceNameMatches(ctx, userText, analysis, searchProfile, requestedGender, progressMsg) {
  const matches = findReferenceNameMatches(userText, analysis, searchProfile, {
    gender: requestedGender,
    limit: 30,
    scanLimit: Number(SEARCH.MAX_ROWS_SCAN || 300),
  });

  if (!matches.length || !hasStrongReferenceNameMatch(matches)) return false;

  await updateProgressMessage(
    ctx,
    progressMsg,
    "✅ Знайшов сильний збіг по назві / версії / ключових словах.\\nПоказую спочатку точні збіги з бази."
  );

  const top = matches.slice(0, Number(SEARCH.TOP_K || 3));
  await sendItemsBatch(ctx, top);

  setLastSearch(ctx, {
    mode: "reference_name",
    query: userText,
    items: matches.slice(Number(SEARCH.TOP_K || 3), 30),
    offset: 0,
  });

  const left = Math.max(0, matches.length - Number(SEARCH.TOP_K || 3));
  if (left > 0) {
    await ctx.reply(\`➡️ Є ще \${left} варіантів. Напишіть: "ще" або "дай ще 3"\`);
  }

  return true;
}
`;

if (!src.includes("trySendReferenceNameMatches")) {
  const needle = `function filterAllowedGender(items = [], requestedGender = null) {`;
  const idx = src.indexOf(needle);
  if (idx !== -1) {
    const nextSection = src.indexOf("/* =========================", idx + 1);
    if (nextSection !== -1) {
      src = src.slice(0, nextSection) + helper + "\n" + src.slice(nextSection);
    }
  }
}

// 3) Cap obvious findCandidates/runFullDbSearch limits.
src = src.replace(/runFullDbSearch\(([^,\n]+),\s*120\)/g, "runFullDbSearch($1, 30)");
src = src.replace(/findCandidates\(([^,\n]+),\s*120\)/g, "findCandidates($1, 30)");
src = src.replace(/SEARCH\.LIMIT_CANDIDATES/g, "capSearchLimit(SEARCH.LIMIT_CANDIDATES)");

// 4) Insert reference-name short circuit after requestedGender is computed.
// This is the most common variable name in your file.
const refBlock = `
  const referenceSent = await trySendReferenceNameMatches(
    ctx,
    text,
    analysis,
    searchProfile,
    requestedGender,
    progressMsg
  );
  if (referenceSent) {
    incrementSearchCounterForActor(ctx);
    return true;
  }
`;

if (!src.includes("const referenceSent = await trySendReferenceNameMatches")) {
  const patterns = [
    /const requestedGender = detectRequestedGender\(text, analysis, searchProfile\);\n/,
    /const requestedGender = detectRequestedGender\(userText, analysis, searchProfile\);\n/,
  ];

  let patched = false;
  for (const re of patterns) {
    if (re.test(src)) {
      src = src.replace(re, (m) => m + refBlock);
      patched = true;
      break;
    }
  }

  if (!patched) {
    console.warn("⚠️ Could not auto-insert reference-name short circuit.");
    console.warn("Paste this block right after requestedGender/searchProfile are ready and before findCandidates/runFullDbSearch:");
    console.warn(refBlock);
  }
}

fs.writeFileSync(file, src);
console.log("✅ Patched:", file);
console.log("Backup:", backup);
