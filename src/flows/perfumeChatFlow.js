// src/flows/perfumeChatFlow.js
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
const { writePerfumeNotes } = require("../llm/writePerfumeNotes");
const { userMenuKeyboard } = require("../ui/keyboards");

/* =========================
   User mode state
   modes: "pick" | "notes"
========================= */
const userMode = new Map();

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// UA/RU -> Latin (простий трансліт достатній для брендів)
function translitCyrToLat(input) {
  const s = String(input || "");
  const map = {
    а:"a",б:"b",в:"v",г:"h",ґ:"g",д:"d",е:"e",є:"ye",ж:"zh",з:"z",и:"y",і:"i",ї:"yi",й:"y",к:"k",л:"l",м:"m",
    н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ь:"",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"H",Ґ:"G",Д:"D",Е:"E",Є:"Ye",Ж:"Zh",З:"Z",И:"Y",І:"I",Ї:"Yi",Й:"Y",К:"K",Л:"L",М:"M",
    Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Shch",Ь:"",Ю:"Yu",Я:"Ya",

    // RU
    ё:"yo",ъ:"",ы:"y",э:"e",
    Ё:"Yo",Ъ:"",Ы:"Y",Э:"E",
  };
  return s.split("").map((ch) => (ch in map ? map[ch] : ch)).join("");
}

function buildNameVariants(q) {
  const raw = String(q || "").trim();
  if (!raw) return [];

  const clean = raw.replace(/^["'“”]+|["'“”]+$/g, "").trim();

  const variants = new Set();
  const push = (x) => {
    const t = String(x || "").trim();
    if (t.length >= 2) variants.add(t);
  };

  push(clean);

  // lower / space-normalized
  push(norm(clean));

  // translit if contains cyrillic
  if (/[А-Яа-яЁёЄєІіЇїҐґ]/.test(clean)) {
    push(translitCyrToLat(clean));
    push(norm(translitCyrToLat(clean)));
  }

  // brand fixes for Victoria's Secret
  // 1) "victoria secret" -> "victoria's secret"
  for (const v of Array.from(variants)) {
    const vv = norm(v);
    if (vv.includes("victoria secret")) {
      push(vv.replace(/\bvictoria secret\b/g, "victoria's secret"));
      push(v.replace(/Victoria Secret/g, "Victoria's Secret"));
    }
    // common UA/RU phrase -> english
    if (vv.includes("виктория сикрет") || vv.includes("виктория секрет")) {
      push("Victoria's Secret");
      push("Victoria Secret");
    }
  }

  // remove apostrophes / add apostrophes (both ways)
  for (const v of Array.from(variants)) {
    push(v.replace(/['’]/g, ""));
    // add 's between word + s when missing (basic)
    push(v.replace(/\b(\w+)\s+s\b/gi, "$1's"));
  }

  // final uniq list
  return Array.from(variants).slice(0, 8);
}

// tries name-like search by multiple variants
function findByNameVariants(query, { limit = 3 } = {}) {
  const variants = buildNameVariants(query);
  for (const v of variants) {
    const hit = findPerfumesByNameLike(v, { limit }) || [];
    if (hit.length) return { items: hit, usedQuery: v, variants };
  }
  return { items: [], usedQuery: "", variants };
}

if (typeof detectForWhomFromText !== "function") {
  throw new Error(
    "detectForWhomFromText is not exported from smartSearchPipeline.js",
  );
}

function getMode(ctx) {
  const tgId = ctx.from?.id;
  if (!tgId) return null;
  return userMode.get(tgId) || null;
}

function isPickMode(ctx) {
  return getMode(ctx) === "pick";
}

function enablePickMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) userMode.set(tgId, "pick");
}

function enableNotesMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) userMode.set(tgId, "notes");
}

function disableMode(ctx) {
  const tgId = ctx.from?.id;
  if (tgId) userMode.delete(tgId);
}

/* =========================
   UI helpers
========================= */
async function replyWithModes(ctx, text) {
  return ctx.reply(text, userMenuKeyboard());
}

async function replyModeHint(ctx) {
  return ctx.reply("↩️ Обери режим:", userMenuKeyboard());
}

/* =========================
   Parse helpers
========================= */
function parseTopN(text) {
  const t = String(text || "").trim();
  const m = t.match(/\b(топ|top)\s*[-]?\s*(\d{1,2})\b/i);
  if (!m) return null;

  const nRaw = Number(m[2] || 3);
  const n = Math.max(1, Math.min(10, Number.isFinite(nRaw) ? nRaw : 3));
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

function shouldHandleAsCodeLookup(text) {
  const t = String(text || "").trim();
  if (!t) return false;

  const low = t.toLowerCase();

  if (/(схож|similar|like|підбери|знайди|топ|top|аромат|парфум)/i.test(low)) {
    return false;
  }

  if (/\b(код|номер|арт(икул)?)\b/i.test(low)) return true;

  return /^\s*\d{1,4}(?:\s*[A-Za-zА-Яа-яЄєІі])?\s*$/u.test(t);
}

function isMeaningfulSearchText(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return /[\p{L}\p{N}]/u.test(t);
}

function looksLikeDirectNameQuery(text) {
  const t = String(text || "").trim();
  if (!t) return false;

  if (!isMeaningfulSearchText(t)) return false;
  if (/[\n,;:]/.test(t)) return false;

  const low = t.toLowerCase();
  if (/(схож|similar|like|підбери|знайди|топ|top|код|номер|артикул)/i.test(low)) {
    return false;
  }

  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 4;
}

/* =========================
   Notes-mode name check
========================= */
function looksLikePerfumeNameForNotes(text) {
  const t = String(text || "").trim();
  const low = t.toLowerCase();

  if (t.length < 4) return false;

  const badWords = [
    "з ",
    "зі ",
    "без ",
    "ноти",
    "запах",
    "аромат",
    "парфум",
    "парфуми",
    "чолов",
    "жін",
    "унісекс",
    "літо",
    "зима",
    "весна",
    "осін",
    "на кожен день",
    "на роботу",
    "на вечір",
    "солод",
    "свіж",
    "фрукт",
    "квіт",
    "дерев",
    "муск",
    "підбери",
    "знайди",
    "хочу",
    "порадь",
    "порекомендуй",
  ];
  if (badWords.some((w) => low.includes(w))) return false;

  if (/[,\n;]/.test(t)) return false;

  const words = t
    .replace(/[()"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length < 2) return false;

  const longish = words.filter((w) => w.length >= 3);
  if (longish.length < 2) return false;

  return true;
}

/* =========================
   Entry actions
========================= */
async function onUserPickAction(ctx, { silent = false } = {}) {
  enablePickMode(ctx);

  if (!silent) {
    await replyWithModes(
      ctx,
      "✅ Режим підбору активний.\n" +
        "Можеш ввести:\n" +
        "- код: 77A або 60\n" +
        "- запит: 'чоловічі, зима, алкогольні ноти'\n" +
        "- 'схоже на Jean Paul Gaultier Le Male'\n" +
        "- 'топ 3 чоловічі аромати'\n\n" +
        "Щоб вийти — /cancel",
    );
  }
}

async function onUserNotesAction(ctx, { silent = false } = {}) {
  enableNotesMode(ctx);

  if (!silent) {
    await replyWithModes(
      ctx,
      "📄 Режим «Ноти» активний.\n" +
        "Введи назву парфуму (наприклад: Dior Sauvage), і я дам короткий опис.\n\n" +
        "Щоб вийти — /cancel",
    );
  }
}

/* =========================
   Main handler
========================= */
async function onUserText(ctx) {
  const mode = getMode(ctx);
  if (!mode) return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  if (/^\/cancel\b/i.test(text)) {
    disableMode(ctx);
    await replyWithModes(
      ctx,
      "✅ Ок, режим вимкнено. Натисни кнопку ще раз, щоб активувати потрібний режим.",
    );
    return true;
  }

  /* ===== NOTES MODE ===== */
  if (mode === "notes") {
    if (!looksLikePerfumeNameForNotes(text)) {
      await ctx.reply(
        "❗️Для «Ноти» потрібна *конкретна назва парфуму*.\n\n" +
          "✅ Приклади:\n" +
          "• Dior Sauvage\n" +
          "• Lanvin Éclat d’Arpège\n" +
          "• Jean Paul Gaultier Le Male\n\n" +
          "✍️ Введи назву парфуму:",
        userMenuKeyboard(),
      );
      return true;
    }

    try {
      const answer = await writePerfumeNotes(text);
      await ctx.reply(answer, userMenuKeyboard());
    } catch (e) {
      console.error("writePerfumeNotes error:", e?.message || e);
      await ctx.reply(
        "⚠️ Не вдалось отримати опис аромату. Спробуй ще раз.",
        userMenuKeyboard(),
      );
    }

    return true;
  }

  /* ===== PICK MODE ===== */
  const forceForWhom = detectForWhomFromText(text);

  const reasonFromRes = (res, p, fallback = "") =>
    (res?.reasons_by_id && res.reasons_by_id[String(p.id)]) || fallback || "";

  // 0) TOP-N
  const topReq = parseTopN(text);
  if (topReq) {
    const forced =
      detectForWhomFromText(text) || detectForWhomFromText(topReq.rest);

    const res = await smartSearchTopN(topReq.rest, topReq.n, {
      limitCandidates: 150,
      forceForWhom: forced,
    });

    if (!res.topItems?.length) {
      await replyWithModes(ctx, "❌ Нічого релевантного не знайшов у базі.");
      return true;
    }

    await replyWithModes(ctx, `🏆 Найкращі ${res.topItems.length} варіант(и):`);
    for (const p of res.topItems) {
      await sendPerfumeCard(ctx, p, {
        notes: false,
        season: false,
        reasonText: reasonFromRes(res, p),
      });
    }
    await replyModeHint(ctx);
    return true;
  }

  // 1) Similar
  const target = parseSimilarTarget(text);
  if (target) {
    const refs = findPerfumesByNameLike(target, { limit: 5 }) || [];
    if (refs.length) {
      const ref = refs[0];
      const forced = forceForWhom || detectForWhomFromText(ref?.for_whom);

      const res = await smartSearchPipeline(text, {
        limitCandidates: 120,
        forceForWhom: forced,
      });

      const top = (res.topItems || []).slice(0, 3);

      if (!top.length) {
        await replyWithModes(ctx, "❌ Схожих не знайшов.");
        return true;
      }

      await replyWithModes(ctx, `✨ Схожі (топ-${top.length})`);
      for (const p of top) {
        await sendPerfumeCard(ctx, p, {
          notes: false,
          season: false,
          reasonText: reasonFromRes(res, p),
        });
      }
      await replyModeHint(ctx);
      return true;
    }
  }

  // 2) Code/number
  if (!startsWithTop(text) && shouldHandleAsCodeLookup(text)) {
    const code = extractNumberCode(text);
    if (code) {
      const items = findPerfumesByCodeOrDigits(code, { limit: 10 });

      if (!items.length) {
        await replyWithModes(ctx, `❌ Не знайшов у базі код/номер: ${code}`);
        return true;
      }

      const filtered = forceForWhom
        ? items.filter((p) => {
            const fw = detectForWhomFromText(p.for_whom);
            return (
              fw === forceForWhom ||
              (forceForWhom !== "унісекс" && fw === "унісекс")
            );
          })
        : items;

      const list = filtered.length ? filtered : items;

      if (list.length === 1) {
        await sendPerfumeCard(ctx, list[0], {
          notes: false,
          season: false,
          reasonText: `Знайдено по коду: ${code}`,
        });
        await replyModeHint(ctx);
        return true;
      }

      await replyWithModes(
        ctx,
        `🔎 Знайшов ${list.length} варіант(и) по "${code}". Показую до 3:`,
      );
      for (const p of list.slice(0, 3)) {
        await sendPerfumeCard(ctx, p, {
          notes: false,
          season: false,
          reasonText: `Знайдено по коду: ${code}`,
        });
      }
      await replyModeHint(ctx);
      return true;
    }
  }

    // 3) Direct name lookup (з мультимовними варіантами + автоправки)
  if (looksLikeDirectNameQuery(text)) {
    const r = findByNameVariants(text, { limit: 3 });

    if (r.items.length) {
      const used = r.usedQuery && r.usedQuery !== text ? ` (пошук: ${r.usedQuery})` : "";
      await replyWithModes(ctx, `🔎 Знайшов ${r.items.length} варіант(и) за назвою${used}:`);

      for (const p of r.items) {
        await sendPerfumeCard(ctx, p, {
          notes: false,
          season: false,
          reasonText: `Знайдено по назві${used}`,
        });
      }

      await replyModeHint(ctx);
      return true;
    }
  }

  // 4) Garbage / empty
  if (!isMeaningfulSearchText(text)) {
    await replyWithModes(ctx, "❌ Нічого релевантного не знайшов у базі.");
    return true;
  }

  // 5) Main pipeline
  const res = await smartSearchPipeline(text, {
    limitCandidates: 120,
    forceForWhom,
  });

  if (!res.topItems?.length) {
    await replyWithModes(ctx, "❌ Нічого релевантного не знайшов у базі.");
    return true;
  }

  await replyWithModes(ctx, "✨ Топ-3 варіанти:");
  for (const p of res.topItems.slice(0, 3)) {
    await sendPerfumeCard(ctx, p, {
      notes: false,
      season: false,
      reasonText: reasonFromRes(res, p),
    });
  }
  await replyModeHint(ctx);
  return true;
}

module.exports = {
  onUserPickAction,
  onUserNotesAction,
  onUserText,
  enablePickMode,
  enableNotesMode,
  disableMode,
  isPickMode,
};