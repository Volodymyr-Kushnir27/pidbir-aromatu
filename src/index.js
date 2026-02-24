// src/index.js
require("dotenv").config();

process.on("unhandledRejection", (e) =>
  console.error("unhandledRejection:", e),
);
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

const { Telegraf } = require("telegraf");

const { BOT_TOKEN, ADMINS_PATH, USERS_PATH, ACTIONS } = require("./config");
const { getRole } = require("./middleware/auth");

const adminsStore = require("./storage/adminsStore");
const usersStore = require("./storage/usersStore");

const {
  adminMenuKeyboard,
  userMenuKeyboard,
  shareContactKeyboard,
  perfumeCardKeyboard,
} = require("./ui/keyboards");

const { normalizePhone } = require("./utils/phone");

const {
  onAdminAction,
  onAdminText,
  clearAdminState,
} = require("./flows/adminFlow");

const {
  onUserPickAction,
  onUserNotesAction,
  onUserText,
  disableMode,
} = require("./flows/perfumeChatFlow");

// Card / Similar / Toggles
const { getPerfumeById } = require("./search/catalogRepo");
const cardState = require("./flows/perfumeCardState");
const { buildPerfumeCaption } = require("./ui/formatPerfumeCard");
const { similarPerfumesByWeight } = require("./search/similarByWeight");
const { smartSearchPipeline } = require("./search/smartSearchPipeline");
const { sendPerfumeCard } = require("./flows/sendPerfumeCard");

if (!BOT_TOKEN) throw new Error("BOT_TOKEN missing");

const bot = new Telegraf(BOT_TOKEN);

// Global telegraf error catcher
bot.catch((err, ctx) => {
  console.error("Telegraf error:", err);
  try {
    console.error("Update:", JSON.stringify(ctx.update, null, 2));
  } catch {}
});

/* =========================
   Registration State (guest)
   tgId -> { step: "fio", phone }
========================= */
const regState = new Map();

/* =========================
   Helpers
========================= */
function safeFrom(ctx) {
  const f = ctx.from || {};
  return {
    id: f.id,
    username: f.username || "",
    first: f.first_name || "",
    last: f.last_name || "",
    lang: f.language_code || "",
  };
}

async function safeAnswerCb(ctx) {
  try {
    await ctx.answerCbQuery();
  } catch {}
}

function normalizeFio(text) {
  const fio = String(text || "").trim().replace(/\s+/g, " ");
  if (fio.split(" ").length < 2) return null;
  if (fio.length < 5) return null;
  return fio;
}

function findByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  const admin = adminsStore.findByPhone(ADMINS_PATH, phone);
  if (admin) return { kind: "admin", record: admin, phone };

  const user = usersStore.findByPhone(USERS_PATH, phone);
  if (user) return { kind: "user", record: user, phone };

  return null;
}

function attachTgId(kind, phone, tgId) {
  if (kind === "admin" && typeof adminsStore.attachTgId === "function") {
    return adminsStore.attachTgId(ADMINS_PATH, phone, tgId);
  }
  if (kind === "user" && typeof usersStore.attachTgId === "function") {
    return usersStore.attachTgId(USERS_PATH, phone, tgId);
  }
}

function setFio(kind, phone, fio) {
  if (kind === "admin" && typeof adminsStore.setFio === "function") {
    return adminsStore.setFio(ADMINS_PATH, phone, fio);
  }
  if (kind === "user" && typeof usersStore.setFio === "function") {
    return usersStore.setFio(USERS_PATH, phone, fio);
  }
}

async function showHome(ctx) {
  const role = getRole(ctx);

  // reset any active states on home
  try {
    clearAdminState(ctx);
  } catch {}
  try {
    disableMode(ctx);
  } catch {}

  if (role === "admin") {
    return ctx.reply("👑 Admin Menu", adminMenuKeyboard());
  }

  if (role === "user") {
    return ctx.reply("Оберіть режим роботи:", userMenuKeyboard());
  }

  return ctx.reply(
    "⛔ Немає доступу.\n\n" +
      "1️⃣ Надішліть номер телефону (+380...) кнопкою «Поділитися номером»\n" +
      "2️⃣ Потім введіть ФІО\n\n" +
      "Номер має бути доданий адміном.",
    shareContactKeyboard(),
  );
}

/* =========================
   Commands
========================= */
bot.start(async (ctx) => showHome(ctx));
bot.command("home", async (ctx) => showHome(ctx));

bot.command("myid", async (ctx) => {
  const u = safeFrom(ctx);
  return ctx.reply(
    `/start\n\n${u.username}\nId: ${u.id}\nFirst: ${u.first}\nLast: ${u.last}\nLang: ${u.lang}`,
  );
});

/* =========================
   CONTACT → step 1 (guest)
========================= */
bot.on("contact", async (ctx) => {
  const contact = ctx.message?.contact;
  if (!contact) return;

  // Must share OWN contact
  if (contact.user_id && ctx.from?.id && contact.user_id !== ctx.from.id) {
    return ctx.reply("Будь ласка, поділіться СВОЇМ номером через кнопку.");
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) return ctx.reply("❌ Некоректний номер.");

  // debug (можеш прибрати після фіксу)
  console.log("CONTACT RAW:", contact.phone_number);
  console.log("CONTACT NORM:", phone);

  const found = findByPhone(phone);
  if (!found) {
    return ctx.reply("⛔ Номер не знайдено у списку. Зверніться до адміна.");
  }

  // If already has FIO → attach tg_id and go home
  if (found.record?.fio) {
    attachTgId(found.kind, found.phone, ctx.from.id);
    return showHome(ctx);
  }

  // Need FIO
  regState.set(ctx.from.id, { step: "fio", phone: found.phone });
  return ctx.reply("✍️ Введіть ваше ФІО (Прізвище Ім’я).");
});

/* =========================
   TEXT ROUTER
========================= */
bot.on("text", async (ctx) => {
  const role = getRole(ctx);
  const tgId = ctx.from?.id;
  const text = String(ctx.message?.text || "").trim();
  if (!tgId) return;

  // 0) Admin flow steps (only when admin)
  if (role === "admin") {
    const handled = await onAdminText(ctx);
    if (handled) return;
  }

  // 1) Guest registration flow (FIO step)
  const state = regState.get(tgId);
  if (state?.step === "fio") {
    const fio = normalizeFio(text);
    if (!fio) {
      return ctx.reply(
        "❌ ФІО має бути мінімум 2 слова. Наприклад: 'Іваненко Іван'.",
      );
    }

    const found = findByPhone(state.phone);
    if (!found) {
      regState.delete(tgId);
      return ctx.reply("⛔ Номер не знайдено у списку. Зверніться до адміна.");
    }

    attachTgId(found.kind, found.phone, tgId);
    setFio(found.kind, found.phone, fio);

    regState.delete(tgId);
    return showHome(ctx);
  }

  // Optional: allow typing phone manually
  const maybePhone = normalizePhone(text);
  if (maybePhone) {
    const found = findByPhone(maybePhone);
    if (!found) {
      return ctx.reply("⛔ Номер не знайдено у списку. Зверніться до адміна.");
    }

    if (found.record?.fio) {
      attachTgId(found.kind, found.phone, tgId);
      return showHome(ctx);
    }

    regState.set(tgId, { step: "fio", phone: found.phone });
    return ctx.reply("✍️ Введіть ваше ФІО (Прізвище Ім’я).");
  }

  // 2) User modes text (admin/user)
  if (role === "admin" || role === "user") {
    const handled = await onUserText(ctx);
    if (handled) return;
  }

  return ctx.reply("Використайте /start щоб відкрити меню.");
});

/* =========================
   CALLBACK ROUTER
========================= */
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery?.data;
  await safeAnswerCb(ctx);
  if (!data) return;

  console.log("CB DATA:", data);

  const role = getRole(ctx);

  // Back home
  if (data === ACTIONS.BACK_HOME) return showHome(ctx);

  // Exit any user mode (pick/notes)
  if (data === ACTIONS.EXIT_PICK) {
    try {
      disableMode(ctx);
    } catch {}
    return ctx.reply("✅ Режим вимкнено. Напишіть /start.");
  }

  // ---- parse like PREFIX:ID ----
  const [prefix, idRaw] = String(data).split(":");
  const perfumeId = idRaw ? Number(idRaw) : null;

  // message context (needed for state key)
  const msg = ctx.callbackQuery?.message;
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;

  // ---------- Perfume card actions ----------
  if (prefix === "SIMILAR" && perfumeId) {
  const base = getPerfumeById(perfumeId);
  if (!base) return ctx.reply("⚠️ Парфум не знайдено.");

  // робимо "схоже" через smartSearchPipeline (а не similarByWeight.js)
  const q = `схоже на ${base.name}`;
  const res = await smartSearchPipeline(q, { limitCandidates: 180 });

  // прибираємо сам базовий аромат, якщо він раптом потрапив у результат
  const top = (res.topItems || []).filter((p) => Number(p.id) !== Number(base.id)).slice(0, 3);

  if (!top.length) return ctx.reply("❌ Схожих не знайшов.");

  await ctx.reply(`✨ Схожі (топ-${top.length})`);
  for (const p of top) {
    await sendPerfumeCard(ctx, p, { notes: false, season: false });
  }
  return;
}

  // ✅ Toggle NOTES/SEASON (правильний виклик cardState.toggle)
  if ((prefix === "TOGGLE_NOTES" || prefix === "TOGGLE_SEASON") && perfumeId) {
    if (!chatId || !messageId) return;

    const field = prefix === "TOGGLE_NOTES" ? "notes" : "season";
    const state = cardState.toggle(chatId, messageId, perfumeId, field);

    const p = getPerfumeById(perfumeId);
    if (!p) return ctx.reply("⚠️ Парфум не знайдено.");

    const caption = buildPerfumeCaption(p, state);
    const keyboard = perfumeCardKeyboard(perfumeId, state);

    try {
      return await ctx.editMessageCaption(caption, keyboard);
    } catch (e) {
      // ✅ якщо Telegram каже "message is not modified" — просто ігноруємо
      const msg = String(e?.description || e?.message || "");
      if (msg.includes("message is not modified")) return;
      console.error("editMessageCaption error:", e);
      return;
    }
  }

  // ---------- Admin menu actions ----------
  if (String(data).startsWith("ADMIN_")) {
    if (role !== "admin") return ctx.reply("⛔ Доступ тільки для адміна.");

    const map = {
      ADMIN_ADD_USER: "ADD_USER",
      ADMIN_DEL_USER: "DEL_USER",
      ADMIN_LIST_USERS: "LIST_USERS",
      ADMIN_ADD_ADMIN: "ADD_ADMIN",
      ADMIN_DEL_ADMIN: "DEL_ADMIN",
      ADMIN_LIST_ADMINS: "LIST_ADMINS",
    };

    const action = map[data];
    if (!action) return ctx.reply("⚠️ Невідома адмін-дія.");
    return onAdminAction(ctx, action);
  }

  // ---------- User menu actions ----------
  if (data === ACTIONS.USER_PICK) {
    if (role !== "admin" && role !== "user") {
      return ctx.reply("⛔ Немає доступу.", shareContactKeyboard());
    }
    return onUserPickAction(ctx);
  }

  if (data === ACTIONS.USER_NOTES) {
    if (role !== "admin" && role !== "user") {
      return ctx.reply("⛔ Немає доступу.", shareContactKeyboard());
    }
    return onUserNotesAction(ctx);
  }

  return ctx.reply("⚠️ Невідома дія кнопки.");
});

/* =========================
   Launch
========================= */
bot.launch().then(() => console.log("Bot started"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));