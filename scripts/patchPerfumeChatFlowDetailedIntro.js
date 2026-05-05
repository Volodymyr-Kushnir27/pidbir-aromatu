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
  if (idx === -1) {
    throw new Error(`Не знайшов місце вставки після: ${needle}`);
  }
  return (
    source.slice(0, idx + needle.length) +
    "\n" +
    insert.trim() +
    "\n" +
    source.slice(idx + needle.length)
  );
}

function replaceAllSafe(source, searchValue, replaceValue) {
  return source.split(searchValue).join(replaceValue);
}

// 1. Додаємо helper для нормального intro.
const helper = `
async function replyReferenceIntro(ctx, text, analysis, webPerfumeData = null) {
  try {
    const intro = await writeReferencePerfumeIntro({
      userText: text,
      analysis,
      webPerfumeData,
    });

    if (
      intro &&
      !/не\\\\s+знайш(ов|ла|ли)|на\\\\s+жаль|спробуйте\\\\s+щось\\\\s+інше|відсутн/i.test(
        intro,
      )
    ) {
      await ctx.reply(intro);
      return true;
    }
  } catch (e) {
    console.error("replyReferenceIntro error:", e?.message || e);
  }

  return false;
}
`;

if (!src.includes("async function replyReferenceIntro(")) {
  const marker = "function buildApproximateNoExactReply(";
  const idx = src.indexOf(marker);
  if (idx === -1) {
    throw new Error("Не знайшов buildApproximateNoExactReply для вставки helper");
  }
  src = src.slice(0, idx) + helper.trim() + "\n\n" + src.slice(idx);
}

// 2. Видаляємо/заміщуємо типові короткі reply по user_friendly_reply,
// які дають повідомлення типу "Зрозумів орієнтир..." або "На жаль..."
const replacements = [
  [
    "await ctx.reply(analysis.user_friendly_reply);",
    `if (!(await replyReferenceIntro(ctx, text, analysis, typeof webPerfumeData !== "undefined" ? webPerfumeData : null))) {
      await ctx.reply(analysis.user_friendly_reply);
    }`,
  ],
  [
    "await ctx.reply(analysis?.user_friendly_reply);",
    `if (!(await replyReferenceIntro(ctx, text, analysis, typeof webPerfumeData !== "undefined" ? webPerfumeData : null))) {
      await ctx.reply(analysis?.user_friendly_reply);
    }`,
  ],
  [
    "await ctx.reply(knownRef.analysis.user_friendly_reply);",
    `if (!(await replyReferenceIntro(ctx, text, analysis, typeof webPerfumeData !== "undefined" ? webPerfumeData : null))) {
      await ctx.reply(knownRef.analysis.user_friendly_reply);
    }`,
  ],
  [
    "await ctx.reply(knownRef?.analysis?.user_friendly_reply);",
    `if (!(await replyReferenceIntro(ctx, text, analysis, typeof webPerfumeData !== "undefined" ? webPerfumeData : null))) {
      await ctx.reply(knownRef?.analysis?.user_friendly_reply);
    }`,
  ],
];

for (const [from, to] of replacements) {
  src = replaceAllSafe(src, from, to);
}

// 3. Якщо в коді є safeReply замість ctx.reply.
const safeReplacements = [
  [
    "await safeReply(ctx, analysis.user_friendly_reply);",
    `if (!(await replyReferenceIntro(ctx, text, analysis, typeof webPerfumeData !== "undefined" ? webPerfumeData : null))) {
      await safeReply(ctx, analysis.user_friendly_reply);
    }`,
  ],
  [
    "await safeReply(ctx, analysis?.user_friendly_reply);",
    `if (!(await replyReferenceIntro(ctx, text, analysis, typeof webPerfumeData !== "undefined" ? webPerfumeData : null))) {
      await safeReply(ctx, analysis?.user_friendly_reply);
    }`,
  ],
];

for (const [from, to] of safeReplacements) {
  src = replaceAllSafe(src, from, to);
}

// 4. Якщо після analyzePerfumeIntent взагалі немає виклику writeReferencePerfumeIntro,
// вставляємо intro перед "Підібрав 3...".
// Патерн не ідеальний, але безпечний: вставляє тільки один раз.
if (!src.includes('logStep("reference intro sent"')) {
  const possibleMarkers = [
    'await ctx.reply("✨ Підібрав 3 найбільш схожі варіанти:");',
    'await ctx.reply(`✨ Підібрав 3 найбільш схожі варіанти:`);',
    'await safeReply(ctx, "✨ Підібрав 3 найбільш схожі варіанти:");',
  ];

  let inserted = false;

  for (const marker of possibleMarkers) {
    const idx = src.indexOf(marker);
    if (idx !== -1) {
      const introBlock = `
    if (analysis?.query_type === "reference_perfume") {
      const introSent = await replyReferenceIntro(
        ctx,
        text,
        analysis,
        typeof webPerfumeData !== "undefined" ? webPerfumeData : null,
      );

      logStep("reference intro sent", {
        text,
        ms: Date.now() - startedAt,
        introSent,
        target_name: analysis?.target_name,
        brand: analysis?.brand,
      });
    }

`;
      src = src.slice(0, idx) + introBlock + src.slice(idx);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    console.warn(
      "⚠️ Не знайшов стандартний marker 'Підібрав 3...'. Helper додано, але intro block не вставлено автоматично.",
    );
  }
}

fs.writeFileSync(flowPath, src, "utf8");

console.log("✅ perfumeChatFlow.js patched:");
console.log("- added replyReferenceIntro()");
console.log("- user_friendly_reply now replaced by detailed intro where pattern matched");
console.log("- tries to insert detailed intro before result cards");
