// index.js
require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const OpenAI = require("openai");
const Database = require("better-sqlite3");

const AI = require("./AI");

/* =======================
   ENV CHECKS
======================= */
if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN missing");
if (!process.env.DB_PATH) throw new Error("DB_PATH missing");
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";

const RESULT_MAX = 3;

const bot = new Telegraf(process.env.BOT_TOKEN);
const db = new Database(process.env.DB_PATH, { readonly: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =======================
   HELPERS
======================= */
function pickFirstImageUrl(photo) {
  if (!photo) return null;
  const parts = String(photo)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = parts.find(
    (u) => /^https?:\/\//i.test(u) && /\.(png|jpe?g|webp)(\?.*)?$/i.test(u)
  );
  return ok || parts[0] || null;
}

function clipTelegram(text, limit = 980) {
  const t = (text || "").trim();
  return t.length > limit ? t.slice(0, limit) + "…" : t;
}

function genderLabel(p) {
  const t = `${p.for_whom || ""} ${p.komu || ""}`.toLowerCase();
  if (t.includes("унісекс") || t.includes("unisex")) return "🧑‍🤝‍🧑 <b>Унісекс</b>";
  if (t.includes("чолов") || t.includes("муж") || t.includes("men") || t.includes("homme")) return "👨 <b>Чоловічий</b>";
  if (t.includes("жіноч") || t.includes("жен") || t.includes("women") || t.includes("femme")) return "👩 <b>Жіночий</b>";
  return "⚪ <b>Стать не вказана</b>";
}

/* =======================
   DB LOAD
======================= */
const perfumesAll = db.prepare(`SELECT * FROM perfumes`).all();
AI.buildCodeIndex(perfumesAll);

const perfumesById = new Map(perfumesAll.map((p) => [p.id, p]));

function loadEmbeddings() {
  try {
    const rows = db
      .prepare(`SELECT perfume_id, embedding_json FROM perfume_embeddings WHERE model=?`)
      .all(EMBED_MODEL);

    return rows.map((r) => ({
      perfume_id: r.perfume_id,
      embedding: JSON.parse(r.embedding_json),
    }));
  } catch (e) {
    console.error("⚠️ Could not load embeddings. Did you run build_embeddings.js?", e?.message || e);
    return [];
  }
}

let EMBEDDINGS = loadEmbeddings();
const EMB_MAP = new Map(EMBEDDINGS.map((e) => [e.perfume_id, e.embedding]));

/* =======================
   UI
======================= */
function buttons(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🧾 Ноти", `tog:notes:${id}`),
      Markup.button.callback("🌤️ Сезон", `tog:season:${id}`),
    ],
    [Markup.button.callback("✨ Схоже", `sim:${id}`)],
  ]);
}

function baseCard(p) {
  const name = AI.stripHtml(p.name || "Аромат");
  const g = genderLabel(p);

  const type = AI.stripHtml(p.type || "");
  const occ = AI.stripHtml(p.occasion || "");
  const age = AI.stripHtml(p.age || "");
  const desc = AI.stripHtml(p.description || "");

  const lines = [
    `<b>${name}</b>`,
    g,
    "",
    `<b>Тип:</b> ${type || "—"}`,
    `<b>Для події:</b> ${occ || "—"}`,
    `<b>Вік:</b> ${age || "—"}`,
    "",
    `<b>Опис:</b> ${desc ? clipTelegram(desc, 340) : "—"}`,
  ].join("\n");

  return clipTelegram(lines, 1000);
}

function notesCard(p) {
  const name = AI.stripHtml(p.name || "Аромат");
  const g = genderLabel(p);
  const notes = AI.stripHtml(p.notes || "") || "—";
  return clipTelegram(`<b>${name}</b>\n${g}\n\n<b>Ноти:</b>\n${notes}`, 1000);
}

function seasonCard(p) {
  const name = AI.stripHtml(p.name || "Аромат");
  const g = genderLabel(p);
  const season = AI.stripHtml(p.season || "") || "—";
  return clipTelegram(`<b>${name}</b>\n${g}\n\n<b>Сезон:</b>\n${season}`, 1000);
}

/* =======================
   Toggle cache
======================= */
const TOGGLE_CACHE = new Map();
function toggleCacheSet(key, val) {
  TOGGLE_CACHE.set(key, val);
  if (TOGGLE_CACHE.size > 3000) {
    const first = TOGGLE_CACHE.keys().next().value;
    TOGGLE_CACHE.delete(first);
  }
}

/* =======================
   SEND (1..3)
======================= */
async function sendPerfumes(ctx, perfumes) {
  for (const p of perfumes.slice(0, RESULT_MAX)) {
    const photo = pickFirstImageUrl(p.photo);
    const base = baseCard(p);
    const notes = notesCard(p);
    const season = seasonCard(p);

    let sent;
    try {
      if (photo) {
        sent = await ctx.replyWithPhoto(photo, {
          caption: base,
          parse_mode: "HTML",
          ...buttons(p.id),
        });
      } else {
        sent = await ctx.reply(base, { parse_mode: "HTML", ...buttons(p.id) });
      }
    } catch (e) {
      console.error("send failed:", e?.response?.description || e?.message || e);
      sent = await ctx.reply(base, { parse_mode: "HTML", ...buttons(p.id) });
    }

    const chatId = sent?.chat?.id;
    const msgId = sent?.message_id;
    if (chatId && msgId) {
      toggleCacheSet(`${chatId}:${msgId}`, {
        perfumeId: p.id,
        isPhoto: !!photo,
        base,
        notes,
        season,
        view: "base",
      });
    }
  }
}

/* =======================
   SMART SEARCH (Seller)
======================= */
async function findPerfumesSmartSeller(rawQuery) {
  const q = String(rawQuery || "").trim();
  if (!q) return { mode: "none", perfumes: [] };

  // 1) CODE SEARCH (100% by NAME)
  if (AI.looksLikeCodeQuery(q)) {
    const found = AI.findByCodeInName(perfumesAll, q);
    return { mode: "code", perfumes: found.slice(0, RESULT_MAX) };
  }

  // 2) EMBEDDINGS candidates
  const scored = await AI.semanticCandidates({
    openai,
    embedModel: EMBED_MODEL,
    query: q,
    embeddings: EMBEDDINGS,
    perfumesById,
    limitHard: 70,
  });

  // якщо embeddings нема — fallback in-memory OR (але це гірше)
  if (!scored.length) {
    const qq = q.toLowerCase();
    const fallback = perfumesAll.filter((p) => Object.values(p).join(" ").toLowerCase().includes(qq));
    return { mode: "fallback", perfumes: fallback.slice(0, RESULT_MAX) };
  }

  // 3) GPT rerank "як продавець"
  const candidatePerfumes = scored.map((x) => x.p);

  const topIds = await AI.gptSelectTopIds({
    openai,
    chatModel: CHAT_MODEL,
    userQuery: q,
    candidates: candidatePerfumes,
    maxPick: RESULT_MAX,
  });

  if (topIds.length) {
    const pick = topIds.map((id) => perfumesById.get(id)).filter(Boolean);
    return { mode: "ai", perfumes: pick };
  }

  // Якщо GPT сказав [] — тоді показуємо найкращий 1 по embeddings (щоб не було пусто)
  // але без “сміття”: тільки top-1
  return { mode: "semantic_top1", perfumes: [candidatePerfumes[0]].filter(Boolean) };
}

/* =======================
   BOT
======================= */
bot.start((ctx) => {
  ctx.reply(
    "⚱💨 <b>Підбір ароматів (як консультант)</b>\n\n" +
      "• Запит природною мовою:\n" +
      "  <i>солодкі цитрусові чоловічі для літа</i>\n" +
      "  <i>несолодкий деревний для офісу</i>\n" +
      "  <i>пудровий чистий як після душу</i>\n\n" +
      "• Або введи <b>код/номер</b>:\n" +
      "  <i>77A</i>, <i>601</i>, <i>154</i>, <i>154A/6E</i>, <i>6E</i>\n\n" +
      "Покажу <b>1–3</b> результати за релевантністю.",
    { parse_mode: "HTML" }
  );
});

bot.command("reload", (ctx) => {
  EMBEDDINGS = loadEmbeddings();
  EMB_MAP.clear();
  for (const e of EMBEDDINGS) EMB_MAP.set(e.perfume_id, e.embedding);
  ctx.reply(`🔄 Embeddings перезавантажено: ${EMBEDDINGS.length}`);
});

bot.on("text", async (ctx) => {
  const raw = (ctx.message.text || "").trim();
  if (!raw) return;

  try {
    const { mode, perfumes } = await findPerfumesSmartSeller(raw);

    if (mode === "code" && !perfumes.length) {
      return ctx.reply(
        "❌ Не знайшов такий код у <b>назві</b> (100% збіг).\n" +
          "Приклади: <i>77A</i>, <i>601</i>, <i>154</i>, <i>154A/6E</i>.",
        { parse_mode: "HTML" }
      );
    }

    if (!perfumes.length) {
      return ctx.reply(
        "❌ Нічого релевантного не знайшов.\n" +
          "Спробуй: «чоловічий цитрус літо», «несолодкий деревний», «пудровий чистий»."
      );
    }

    await sendPerfumes(ctx, perfumes);
  } catch (e) {
    console.error(e);
    const msg = e?.response?.description || e?.message || "Невідома помилка";
    ctx.reply(`⚠️ Помилка: ${msg}`);
  }
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery?.data || "";

  // TOGGLE
  if (data.startsWith("tog:")) {
    const [, what, idStr] = data.split(":");
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;

    const chatId = ctx.callbackQuery?.message?.chat?.id;
    const msgId = ctx.callbackQuery?.message?.message_id;
    if (!chatId || !msgId) return;

    const key = `${chatId}:${msgId}`;
    let cached = TOGGLE_CACHE.get(key);

    if (!cached) {
      const p = perfumesById.get(id);
      if (!p) {
        await ctx.answerCbQuery("Не знайшов аромат у БД");
        return;
      }
      cached = {
        perfumeId: id,
        isPhoto: !!pickFirstImageUrl(p.photo),
        base: baseCard(p),
        notes: notesCard(p),
        season: seasonCard(p),
        view: "base",
      };
      toggleCacheSet(key, cached);
    }

    await ctx.answerCbQuery("Ок");

    let nextText = cached.base;
    let nextView = "base";

    if (what === "notes") {
      if (cached.view === "notes") {
        nextText = cached.base;
        nextView = "base";
      } else {
        nextText = cached.notes;
        nextView = "notes";
      }
    }

    if (what === "season") {
      if (cached.view === "season") {
        nextText = cached.base;
        nextView = "base";
      } else {
        nextText = cached.season;
        nextView = "season";
      }
    }

    cached.view = nextView;
    toggleCacheSet(key, cached);

    try {
      if (cached.isPhoto) {
        await ctx.editMessageCaption(nextText, { parse_mode: "HTML", ...buttons(id) });
      } else {
        await ctx.editMessageText(nextText, { parse_mode: "HTML", ...buttons(id) });
      }
    } catch (e) {
      console.error("edit failed:", e?.response?.description || e?.message || e);
    }
    return;
  }

  // SIMILAR (тепер теж "як продавець", а не просто cosine)
  if (data.startsWith("sim:")) {
    const id = Number(data.split(":")[1]);
    if (!Number.isFinite(id)) return;

    try {
      await ctx.answerCbQuery("Підбираю схожі…");

      const base = perfumesById.get(id);
      const baseEmb = EMB_MAP.get(id);

      if (!base || !baseEmb) {
        await ctx.reply("❌ Немає даних/embedding для цього аромату.");
        return;
      }

      // 1) cosine candidates
      const scored = EMBEDDINGS
        .filter((e) => e.perfume_id !== id)
        .map((e) => ({
          id: e.perfume_id,
          score: AI.cosineSim(baseEmb, e.embedding),
          p: perfumesById.get(e.perfume_id),
        }))
        .filter((x) => x.p)
        .sort((a, b) => b.score - a.score)
        .slice(0, 60);

      if (!scored.length) {
        await ctx.reply("❌ Не знайшов схожих.");
        return;
      }

      // 2) prefilter by gender bucket (щоб не мішало жіночі/чоловічі)
      const pre = AI.prefilterSimilarCandidates(base, scored).map((x) => x.p);

      // 3) GPT rerank: "схоже на цей аромат"
      const baseName = AI.stripHtml(base.name || "");
      const baseFacts = [
        `Назва: ${baseName}`,
        `Для кого: ${AI.stripHtml(base.for_whom || base.komu || "")}`,
        `Тип: ${AI.stripHtml(base.type || "")}`,
        `Сезон: ${AI.stripHtml(base.season || "")}`,
        `Ноти: ${AI.stripHtml(base.notes || "")}`,
        `Опис: ${AI.stripHtml(base.description || "")}`,
      ].filter(Boolean).join("\n");

      const query = `Підбери максимально схожі на аромат нижче (по ДНК/стилю/нотній ідеї), без випадкових протилежностей.\n\n${baseFacts}`;

      const topIds = await AI.gptSelectTopIds({
        openai,
        chatModel: CHAT_MODEL,
        userQuery: query,
        candidates: pre,
        maxPick: RESULT_MAX,
      });

      const pick = topIds.map((pid) => perfumesById.get(pid)).filter(Boolean);

      // fallback: якщо GPT повернув [], беремо top-3 cosine з pre
      const finalPick = pick.length ? pick : pre.slice(0, RESULT_MAX);

      await sendPerfumes(ctx, finalPick);
      return;
    } catch (e) {
      console.error(e);
      await ctx.answerCbQuery("Помилка");
      await ctx.reply("⚠️ Не вдалося знайти схожі. Спробуй ще раз.");
      return;
    }
  }

  await ctx.answerCbQuery();
});

bot.launch();
console.log(`✅ Bot started | perfumes: ${perfumesAll.length} | embeddings: ${EMBEDDINGS.length} | embed_model: ${EMBED_MODEL} | chat_model: ${CHAT_MODEL}`);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
