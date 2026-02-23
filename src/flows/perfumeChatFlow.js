const {
  extractNumberCode,
  findPerfumesByCodeOrDigits,
  findPerfumesByNameLike,
} = require("../search/catalogRepo");

const {
  smartSearchPipeline,
  smartSearchTopN,
  detectForWhomFromText,
} = require("../search/smartSearchPipeline");

const { sendPerfumeCard } = require("./sendPerfumeCard");

/* =========================
   Pick mode state
========================= */
const pickMode = new Map();

function isPickMode(ctx) {
  const tgId = ctx.from?.id;
  return !!(tgId && pickMode.get(tgId));
}

function enablePickMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) pickMode.set(tgId, true);
}

function disablePickMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) pickMode.delete(tgId);
}

/* =========================
   Helpers
========================= */
function parseTopN(text) {
  const t = String(text || "").trim();
  const m = t.match(/\b(топ|top)\s*[-]?\s*(\d{1,2})\b/i);
  if (!m) return null;

  const nRaw = Number(m[2] || 3);
  const n = Math.max(1, Math.min(10, isNaN(nRaw) ? 3 : nRaw));
  const rest = t.replace(m[0], "").trim();

  return { n, rest: rest || t };
}

function parseSimilarTarget(text) {
  const t = String(text || "").trim();

  const m =
    t.match(/(?:знайди|підбери)?\s*схож\w*\s+на\s+(.+)$/i) ||
    t.match(/(?:similar|like)\s+(?:to|on)\s+(.+)$/i);

  if (!m) return null;

  let target = String(m[1] || "").trim();
  target = target.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  target = target.replace(/[.!?]+$/g, "").trim();

  if (!target || target.length < 3) return null;
  return target;
}

function startsWithTop(text) {
  return /^(?:топ|top)\b/i.test(String(text || "").trim());
}

/* =========================
   Entry
========================= */
async function onUserPickAction(ctx, { silent = false } = {}) {
  enablePickMode(ctx);

  if (!silent) {
    await ctx.reply(
      "✅ Режим підбору активний.\n" +
        "Можеш ввести:\n" +
        "- код: 77A або 60\n" +
        "- запит: 'чоловічі, зима, алкогольні ноти'\n" +
        "- 'схоже на Jean Paul Gaultier Le Male'\n" +
        "- 'топ 3 чоловічі аромати'"
    );
  }
}

/* =========================
   Main text handler
========================= */
async function onUserText(ctx) {
  if (!isPickMode(ctx)) return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  // ✅ force gender for all modes
  const forceForWhom = detectForWhomFromText(text);

  /* 0) TOP-N */
  const topReq = parseTopN(text);
  if (topReq) {
    // force gender also from original text (а не тільки rest)
    const forced = detectForWhomFromText(text) || detectForWhomFromText(topReq.rest);

    const res = await smartSearchTopN(topReq.rest, topReq.n, {
      limitCandidates: 150,
      forceForWhom: forced,
    });

    if (!res.topItems?.length) {
      await ctx.reply("❌ Нічого релевантного не знайшов у базі.");
      return true;
    }

    await ctx.reply(`🏆 Найкращі ${res.topItems.length} варіант(и):`);
    for (const p of res.topItems) {
      await sendPerfumeCard(ctx, p, { notes: false, season: false });
    }
    return true;
  }

  /* 1) Similar */
  const target = parseSimilarTarget(text);
  if (target) {
    const refs = findPerfumesByNameLike(target, { limit: 5 }) || [];
    if (refs.length) {
      const ref = refs[0];

      // якщо користувач просить чоловічий/жіночий — це важливіше ніж стать референса
      const forced = forceForWhom || detectForWhomFromText(ref?.for_whom);

      const res = await smartSearchPipeline(text, {
        limitCandidates: 120,
        forceForWhom: forced,
      });

      const top = (res.topItems || []).slice(0, 3);

      if (!top.length) {
        await ctx.reply("❌ Схожих не знайшов.");
        return true;
      }

      await ctx.reply(`✨ Схожі (топ-${top.length})`);
      for (const p of top) {
        await sendPerfumeCard(ctx, p, { notes: false, season: false });
      }
      return true;
    }
  }

  /* 2) Code/number */
  if (!startsWithTop(text)) {
    const code = extractNumberCode(text);
    if (code) {
      const items = findPerfumesByCodeOrDigits(code, { limit: 10 });

      if (!items.length) {
        await ctx.reply(`❌ Не знайшов у базі код/номер: ${code}`);
        return true;
      }

      // ✅ якщо користувач просив стать — фільтруємо навіть по коду
      const filtered = forceForWhom
        ? items.filter((p) =>
            // genderAllowed вже в pipeline, тут дублюємо легку перевірку
            detectForWhomFromText(p.for_whom) === forceForWhom ||
            (forceForWhom !== "унісекс" && detectForWhomFromText(p.for_whom) === "унісекс")
          )
        : items;

      const list = filtered.length ? filtered : items;

      if (list.length === 1) {
        await sendPerfumeCard(ctx, list[0], { notes: false, season: false });
        return true;
      }

      await ctx.reply(`🔎 Знайшов ${list.length} варіант(и) по "${code}". Показую до 3:`);
      for (const p of list.slice(0, 3)) {
        await sendPerfumeCard(ctx, p, { notes: false, season: false });
      }
      return true;
    }
  }

  /* 3) Default pipeline */
  const res = await smartSearchPipeline(text, {
    limitCandidates: 120,
    forceForWhom, // ✅ головне
  });

  if (!res.topItems?.length) {
    await ctx.reply("❌ Нічого релевантного не знайшов у базі.");
    return true;
  }

  await ctx.reply(`✨ Топ-3 варіанти:`);
  for (const p of res.topItems.slice(0, 3)) {
    await sendPerfumeCard(ctx, p, { notes: false, season: false });
  }

  return true;
}

module.exports = {
  onUserPickAction,
  onUserText,
  enablePickMode,
  disablePickMode,
  isPickMode,
};