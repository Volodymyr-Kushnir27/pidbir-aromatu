
require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const OpenAI = require("openai");
const Database = require("better-sqlite3");

/* =======================
   ENV CHECKS
======================= */
if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN missing");
if (!process.env.DB_PATH) throw new Error("DB_PATH missing");
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";
const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL || CHAT_MODEL;

const bot = new Telegraf(process.env.BOT_TOKEN);
const db = new Database(process.env.DB_PATH, { readonly: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =======================
   HELPERS
======================= */
function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function pickFirstImageUrl(image_url) {
  if (!image_url) return null;
  const parts = String(image_url)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Prefer “image-like” urls, else take first
  const ok = parts.find((u) => /^https?:\/\//i.test(u) && /\.(png|jpe?g|webp)(\?.*)?$/i.test(u));
  return ok || parts[0] || null;
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

/* =======================
   GENDER LOGIC (heuristics)
======================= */
function desiredGenderFromQuery(q) {
  q = (q || "").toLowerCase();
  if (q.includes("унісекс") || q.includes("unisex")) return "unisex";
  if (q.includes("чолов") || q.includes("муж") || q.includes("men") || q.includes("homme")) return "male";
  if (q.includes("жіноч") || q.includes("жен") || q.includes("women") || q.includes("femme")) return "female";
  return null;
}

function inferGender(p) {
  const t = `${p.categories || ""} ${p.name || ""} ${p.short_desc || ""} ${p.description || ""}`.toLowerCase();

  // Priority: unisex
  if (t.includes("унісекс") || t.includes("unisex") || t.includes("for all")) return "unisex";

  const male = t.includes("чолов") || t.includes("men") || t.includes("homme") || t.includes("pour homme");
  const female = t.includes("жіноч") || t.includes("women") || t.includes("femme") || t.includes("pour femme");

  if (male && female) return "unisex";
  if (male) return "male";
  if (female) return "female";
  return "unknown";
}

function genderLabel(g) {
  if (g === "male") return "👨 Чоловічий";
  if (g === "female") return "👩 Жіночий";
  if (g === "unisex") return "🧑‍🤝‍🧑 Унісекс";
  return "⚪ Стать не вказана";
}

/* =======================
   DB QUERIES
======================= */
const keywordSearchStmt = db.prepare(`
  SELECT id, name, image_url, categories, short_desc, description
  FROM perfumes
  WHERE type='variable'
    AND (
      name LIKE '%' || ? || '%'
      OR categories LIKE '%' || ? || '%'
      OR short_desc LIKE '%' || ? || '%'
      OR description LIKE '%' || ? || '%'
    )
  LIMIT 12
`);

const perfumeByIdStmt = db.prepare(`
  SELECT id, name, image_url, categories, short_desc, description
  FROM perfumes
  WHERE id=?
`);

/* =======================
   EMBEDDINGS LOAD (in-memory)
======================= */
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

let EMBEDDINGS = loadEmbeddings(); // { perfume_id, embedding }
const EMB_MAP = new Map(EMBEDDINGS.map((e) => [e.perfume_id, e.embedding]));

/* =======================
   CAPTION CACHE (for in-place toggle)
======================= */
// key: `${chatId}:${messageId}` -> { reasonCaption, compCaption, perfumeId }
const CAPTION_CACHE = new Map();

function cacheSet(key, value) {
  CAPTION_CACHE.set(key, value);
  if (CAPTION_CACHE.size > 1000) {
    const firstKey = CAPTION_CACHE.keys().next().value;
    CAPTION_CACHE.delete(firstKey);
  }
}

/* =======================
   OpenAI (embeddings + reasons + classifier)
======================= */
async function embedText(text) {
  const r = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text,
    encoding_format: "float",
  });
  return r.data[0].embedding;
}

function makePerfumeFacts(p) {
  const cat = stripHtml(p.categories);
  const sd = stripHtml(p.short_desc);
  const d = stripHtml(p.description);
  const facts = [];
  if (cat) facts.push(`Категорії: ${cat}`);
  if (sd) facts.push(`Коротко: ${sd}`);
  if (d) facts.push(`Опис: ${d}`);
  return facts.join("\n");
}

async function gptReasons(userQuery, perfumes) {
  try {
    const items = perfumes.map((p) => ({
      id: p.id,
      name: p.name,
      gender: genderLabel(inferGender(p)),
      facts: makePerfumeFacts(p).slice(0, 900),
    }));

    const prompt = [
      "Ти консультант з парфумів.",
      "Завдання: для кожного кандидата дай коротке пояснення (1-2 речення), чому він підходить під запит користувача.",
      "Важливо:",
      "- Не вигадуй нот/властивостей, яких немає у facts.",
      "- Пояснення має спиратися лише на facts.",
      "- Відповідь ПОВИННА бути валідним JSON без будь-якого додаткового тексту.",
      'Формат: {"<id>":"пояснення", ...}',
      "",
      `Запит користувача: ${userQuery}`,
      "",
      "Кандидати:",
      JSON.stringify(items, null, 2),
    ].join("\n");

    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "Відповідай тільки валідним JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || "";
    const obj = JSON.parse(text);

    const map = new Map();
    for (const [k, v] of Object.entries(obj)) {
      const id = Number(k);
      if (Number.isFinite(id) && typeof v === "string") {
        map.set(id, v.trim());
      }
    }
    return map;
  } catch (e) {
    console.error("gptReasons error:", e?.message || e);
    return new Map();
  }
}

async function isPerfumeQuery(text) {
  const t = (text || "").trim();

  if (t.length < 3) return { ok: false, reason: "too_short" };

  const quick = t.toLowerCase();
  const perfumeHints = [
    "аромат", "парф", "духи", "ноти", "шлейф", "стійк",
    "ваніль", "цитрус", "квіт", "дерев", "пудр",
    "свіж", "солод", "унісекс", "чолов", "жіноч",
    "summer", "winter", "fresh", "sweet", "citrus", "floral",
    "chanel", "dior", "armani", "versace",
    "пахне", "пахнути", "запах", "духів"
  ];
  if (perfumeHints.some((k) => quick.includes(k))) return { ok: true, reason: "keyword" };

  try {
    const prompt = `
Ти модератор запитів до бота підбору парфумів.
Визнач: це запит на підбір аромату чи ні.

ПОВЕРНИ ТІЛЬКИ JSON:
{"ok": true/false, "category": "perfume|offtopic|unclear", "hint": "короткий опис, що зрозумів"}

Правила:
- ok=true якщо користувач описує бажаний аромат, асоціації, сезон, стать, стиль, або просить "схоже на X".
- ok=false якщо привітання/рандомні символи/не по темі/немає сенсу.
- ok=false якщо текст занадто загальний і не зрозуміло, що потрібно підібрати.

Текст користувача: """${t}"""
    `.trim();

    const resp = await openai.chat.completions.create({
      model: CLASSIFY_MODEL,
      messages: [
        { role: "system", content: "Відповідай тільки валідним JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || "";
    const obj = JSON.parse(raw);

    const ok = obj && typeof obj.ok === "boolean" ? obj.ok : false;
    const category = typeof obj.category === "string" ? obj.category : "unclear";
    const hint = typeof obj.hint === "string" ? obj.hint : "";

    return { ok, category, hint };
  } catch (e) {
    console.error("isPerfumeQuery error:", e?.message || e);
    return { ok: false, reason: "classifier_error" };
  }
}

/* =======================
   SEARCH FUNCTIONS
======================= */
async function semanticSearchByQuery(query, limit = 10) {
  const qEmb = await embedText(query);

  return EMBEDDINGS
    .map((e) => ({ id: e.perfume_id, score: cosineSim(qEmb, e.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => perfumeByIdStmt.get(x.id))
    .filter(Boolean);
}

function similarByPerfumeId(baseId, limit = 10) {
  const base = EMB_MAP.get(baseId);
  if (!base) return [];

  return EMBEDDINGS
    .filter((e) => e.perfume_id !== baseId)
    .map((e) => ({ id: e.perfume_id, score: cosineSim(base, e.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => perfumeByIdStmt.get(x.id))
    .filter(Boolean);
}

/* =======================
   UI BUILDERS
======================= */
function actionButtons(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Склад", `comp:${id}`),
      Markup.button.callback("Схоже", `sim:${id}`),
    ],
  ]);
}

function actionButtonsBack(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("⬅️ Назад", `back:${id}`),
      Markup.button.callback("Схоже", `sim:${id}`),
    ],
  ]);
}

function makeCaptionWithReason(p, reason) {
  const g = genderLabel(inferGender(p));
  const r = (reason || "").trim();
  const caption = `${p.name}\n${g}\n\n${r || "Підібрано за вашим запитом."}`;
  return caption.length > 1000 ? caption.slice(0, 1000) + "…" : caption;
}

function makeCompositionCaption(p) {
  const g = genderLabel(inferGender(p));
  const short = stripHtml(p.short_desc || "");
  const desc = stripHtml(p.description || "");

  let body = "";
  if (short) body += `Коротко: ${short}\n\n`;
  if (desc) body += `Опис: ${desc}`;
  if (!body.trim()) body = "Опис відсутній.";

  const text = `${p.name}\n${g}\n\n${body}`.trim();
  return text.length > 1000 ? text.slice(0, 1000) + "…" : text;
}

/* =======================
   SEND
======================= */
async function sendPerfumes(ctx, userQuery, perfumes) {
  const reasons = await gptReasons(userQuery, perfumes);

  for (const p of perfumes) {
    const photo = pickFirstImageUrl(p.image_url);
    const reasonCaption = makeCaptionWithReason(p, reasons.get(p.id));
    const compCaption = makeCompositionCaption(p);

    try {
      let sent;

      if (photo) {
        sent = await ctx.replyWithPhoto(photo, { caption: reasonCaption, ...actionButtons(p.id) });
      } else {
        sent = await ctx.reply(reasonCaption, actionButtons(p.id));
      }

      const chatId = sent?.chat?.id;
      const msgId = sent?.message_id;
      if (chatId && msgId) {
        cacheSet(`${chatId}:${msgId}`, { reasonCaption, compCaption, perfumeId: p.id });
      }
    } catch (e) {
      console.error("send failed:", e?.response?.description || e?.message || e);

      const sent = await ctx.reply(reasonCaption, actionButtons(p.id));
      const chatId = sent?.chat?.id;
      const msgId = sent?.message_id;
      if (chatId && msgId) {
        cacheSet(`${chatId}:${msgId}`, { reasonCaption, compCaption, perfumeId: p.id });
      }
    }
  }
}

/* =======================
   BOT HANDLERS
======================= */
bot.start((ctx) => {
  ctx.reply(
    "👃 Підбір ароматів (розумний пошук)\n" +
      "Пиши запит (можна зі статтю):\n" +
      "• «чоловічий свіжий цитрусовий на літо»\n" +
      "• «жіночий солодкий ванільний»\n" +
      "• «унісекс чистий пудровий»\n\n" +
      "Під кожним ароматом є кнопки «Склад» та «Схоже»."
  );
});

// Reload embeddings without restarting
bot.command("reload", (ctx) => {
  EMBEDDINGS = loadEmbeddings();
  EMB_MAP.clear();
  for (const e of EMBEDDINGS) EMB_MAP.set(e.perfume_id, e.embedding);
  ctx.reply(`🔄 Embeddings перезавантажено: ${EMBEDDINGS.length}`);
});

bot.on("text", async (ctx) => {
  const q = (ctx.message.text || "").trim();
  if (!q) return;

  const check = await isPerfumeQuery(q);
  if (!check.ok) {
    return ctx.reply(
      "Ваш запит не по темі підбору аромату. Напишіть, будь ласка, який аромат бажаєте підібрати.\n" +
        "Наприклад: «чоловічий свіжий цитрусовий на літо», «жіночий солодкий ванільний», «унісекс пудровий»."
    );
  }

  try {
    const wantedGender = desiredGenderFromQuery(q);
    let results = [];

    if (EMBEDDINGS.length > 0 && q.length >= 3) {
      results = await semanticSearchByQuery(q, 12);
    }

    if (!results.length) {
      results = keywordSearchStmt.all(q, q, q, q);
    }

    if (wantedGender) {
      results = results.filter((p) => inferGender(p) === wantedGender);
    }

    results = results.slice(0, 5);

    if (!results.length) {
      return ctx.reply("❌ Нічого не знайшов. Спробуй інші слова/асоціації.");
    }

    await sendPerfumes(ctx, q, results);
  } catch (e) {
    console.error(e);
    const msg = e?.response?.description || e?.message || "Невідома помилка";
    ctx.reply(`⚠️ Помилка підбору: ${msg}`);
  }
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery?.data || "";

  // ====== SIMILAR ======
  if (data.startsWith("sim:")) {
    const id = Number(data.split(":")[1]);
    if (!Number.isFinite(id)) return;

    try {
      await ctx.answerCbQuery("Шукаю схожі…");

      let results = similarByPerfumeId(id, 12).slice(0, 5);
      if (!results.length) {
        return ctx.reply("❌ Не знайшов схожих (немає embedding для цього аромату).");
      }

      const base = perfumeByIdStmt.get(id);
      const baseName = base?.name ? `"${base.name}"` : "обраного аромату";
      const queryText = `Схожі на ${baseName}`;

      await sendPerfumes(ctx, queryText, results);
      return;
    } catch (e) {
      console.error(e);
      await ctx.answerCbQuery("Помилка");
      return ctx.reply("⚠️ Не вдалося знайти схожі. Спробуй ще раз.");
    }
  }

  // ====== COMPOSITION IN-PLACE (edit caption) ======
  if (data.startsWith("comp:")) {
    const id = Number(data.split(":")[1]);
    if (!Number.isFinite(id)) return;

    try {
      await ctx.answerCbQuery("Показую склад…");

      const chatId = ctx.callbackQuery?.message?.chat?.id;
      const msgId = ctx.callbackQuery?.message?.message_id;
      if (!chatId || !msgId) return;

      const key = `${chatId}:${msgId}`;
      let cached = CAPTION_CACHE.get(key);

      if (!cached) {
        const p = perfumeByIdStmt.get(id);
        if (!p) return ctx.reply("❌ Не знайшов цей аромат у базі.");
        cached = {
          reasonCaption: makeCaptionWithReason(p, ""),
          compCaption: makeCompositionCaption(p),
          perfumeId: id,
        };
        cacheSet(key, cached);
      }

      await ctx.editMessageCaption(cached.compCaption, { ...actionButtonsBack(id) });
      return;
    } catch (e) {
      console.error(e);
      await ctx.answerCbQuery("Помилка");
      return;
    }
  }

  // ====== BACK (restore GPT reason caption) ======
  if (data.startsWith("back:")) {
    const id = Number(data.split(":")[1]);
    if (!Number.isFinite(id)) return;

    try {
      await ctx.answerCbQuery("Повертаю…");

      const chatId = ctx.callbackQuery?.message?.chat?.id;
      const msgId = ctx.callbackQuery?.message?.message_id;
      if (!chatId || !msgId) return;

      const key = `${chatId}:${msgId}`;
      const cached = CAPTION_CACHE.get(key);
      if (!cached) return;

      await ctx.editMessageCaption(cached.reasonCaption, { ...actionButtons(id) });
      return;
    } catch (e) {
      console.error(e);
      await ctx.answerCbQuery("Помилка");
      return;
    }
  }

  await ctx.answerCbQuery();
});

bot.launch();
console.log(
  `✅ Bot started | embeddings: ${EMBEDDINGS.length} | embed_model: ${EMBED_MODEL} | chat_model: ${CHAT_MODEL} | classify_model: ${CLASSIFY_MODEL}`
);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
