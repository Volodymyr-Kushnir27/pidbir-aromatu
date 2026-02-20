// src/index.js
require("dotenv").config();

process.on("unhandledRejection", (e) =>
  console.error("unhandledRejection:", e),
);
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

const fs = require("fs");
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
  onUserText,
  disablePickMode,
} = require("./flows/perfumeChatFlow");

// Card / Similar / Toggles
const { getPerfumeById } = require("./search/catalogRepo");
const cardState = require("./flows/perfumeCardState");
const { buildPerfumeCaption } = require("./ui/formatPerfumeCard");
const { similarPerfumes } = require("./search/similarByRef");
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
async function showHome(ctx) {
  const role = getRole(ctx);

  // reset any active modes on home
  try {
    clearAdminState(ctx);
  } catch {}
  try {
    if (role !== "user") disablePickMode(ctx);
  } catch {}

  if (role === "admin") {
    return ctx.reply("👑 Admin Menu", adminMenuKeyboard());
  }

  if (role === "user") {
    // ✅ для продавця режим підбору завжди активний
    try {
      clearAdminState(ctx);
    } catch {}
    // НЕ викликаємо disablePickMode тут
    await onUserPickAction(ctx);

    return ctx.reply(
      "✅ Ти в режимі підбору активний.\n" +
        "Можеш ввести:\n" +
        "- код парфуму: 77A\n" +
        "- або назву/опис: солодкий цитрус на літо",
    );
  }

  return ctx.reply(
    "⛔ Немає доступу.\n\n" +
      "1️⃣ Надішліть номер телефону (+380...) кнопкою «Поділитися номером»\n" +
      "2️⃣ Потім введіть ФІО\n\n" +
      "Номер має бути доданий адміном.",
    shareContactKeyboard(),
  );
}

function normalizeFio(text) {
  const fio = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (fio.split(" ").length < 2) return null;
  if (fio.length < 5) return null;
  return fio;
}

function findByPhone(phone) {
  const admin = adminsStore.findByPhone(ADMINS_PATH, phone);
  if (admin) return { kind: "admin", record: admin };

  const user = usersStore.findByPhone(USERS_PATH, phone);
  if (user) return { kind: "user", record: user };

  return null;
}

function attachTgId(kind, phone, tgId) {
  if (kind === "admin")
    return adminsStore.attachTgIdByPhone(ADMINS_PATH, phone, tgId);
  if (kind === "user")
    return usersStore.attachTgIdByPhone(USERS_PATH, phone, tgId);
}

function setFio(kind, phone, fio) {
  if (kind === "admin")
    return adminsStore.setFioByPhone(ADMINS_PATH, phone, fio);
  if (kind === "user") return usersStore.setFioByPhone(USERS_PATH, phone, fio);
}

async function safeAnswerCb(ctx) {
  try {
    await ctx.answerCbQuery();
  } catch {}
}

/* =========================
   Commands
========================= */
bot.start(async (ctx) => showHome(ctx));

bot.command("help", async (ctx) => {
  return ctx.reply(
    "/start — меню\n" +
      "/myid — показати tg_id\n\n" +
      "Реєстрація: номер → ФІО",
  );
});

bot.command("myid", async (ctx) => {
  return ctx.reply(`Ваш tg_id: ${ctx.from?.id}`);
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

  const found = findByPhone(phone);
  if (!found)
    return ctx.reply("⛔ Номер не знайдено у списку. Зверніться до адміна.");

  // If already has FIO → attach tg_id and go home
  if (found.record?.fio) {
    attachTgId(found.kind, phone, ctx.from.id);

    // ✅ якщо це продавець — одразу стартуємо режим підбору
    if (found.kind === "user") {
      await onUserPickAction(ctx); // вмикає pick mode (у твоєму perfumeChatFlow)
      return ctx.reply(
        "✅ Ти в режимі підбору активний.\n" +
          "Можеш ввести:\n" +
          "- код парфуму: 77A\n" +
          "- або назву/опис: солодкий цитрус на літо",
      );
    }

    // ✅ адмін як і раніше бачить меню
    return showHome(ctx);
  }

  // Need FIO
  regState.set(ctx.from.id, { step: "fio", phone });
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
  if (role === "guest") {
    const state = regState.get(tgId);

    // Step 2: waiting FIO
    if (state?.step === "fio") {
      const fio = normalizeFio(text);
      if (!fio)
        return ctx.reply(
          "❌ Невірне ФІО. Введіть мінімум 2 слова (Прізвище Імʼя).",
        );

      const found = findByPhone(state.phone);
      if (!found) {
        regState.delete(tgId);
        return ctx.reply(
          "⛔ Номер не знайдено у списку. Зверніться до адміна.",
        );
      }

      attachTgId(found.kind, state.phone, tgId);
      setFio(found.kind, state.phone, fio);

      regState.delete(tgId);
      return showHome(ctx);
    }

    // Optional: allow typing phone manually
    const maybePhone = normalizePhone(text);
    if (maybePhone) {
      const found = findByPhone(maybePhone);
      if (!found)
        return ctx.reply(
          "⛔ Номер не знайдено у списку. Зверніться до адміна.",
        );

      if (found.record?.fio) {
        attachTgId(found.kind, maybePhone, tgId);

        if (found.kind === "user") {
          await onUserPickAction(ctx);
          return ctx.reply(
            "✅ Ти в режимі підбору активний.\n" +
              "Можеш ввести:\n" +
              "- код парфуму: 77A\n" +
              "- або назву/опис: солодкий цитрус на літо",
          );
        }

        return showHome(ctx);
      }

      regState.set(tgId, { step: "fio", phone: maybePhone });
      return ctx.reply("✍️ Введіть ваше ФІО (Прізвище Ім’я).");
    }

    return ctx.reply(
      "Надішліть номер телефону кнопкою «Поділитися номером» або введіть +380...",
    );
  }

  // 2) User pick mode text (admin also allowed)
  if (role === "admin" || role === "user") {
    const handled = await onUserText(ctx);
    if (handled) return;
  }

  // ✅ якщо user написав щось, а режим ще не активний — активуємо і пробуємо ще раз
if (role === "user") {
  await onUserPickAction(ctx);
  const handled2 = await onUserText(ctx);
  if (handled2) return;
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

  const role = getRole(ctx);

  // Back home
  if (data === ACTIONS.BACK_HOME) return showHome(ctx);

  // Exit pick mode
  if (data === ACTIONS.EXIT_PICK) {
    try {
      disablePickMode(ctx);
    } catch {}
    return ctx.reply("✅ Вийшли з режиму підбору. Напишіть /start.");
  }

  // Perfume card buttons: P:NOTES:<id> / P:SEASON:<id> / P:SIMILAR:<id>
  if (typeof data === "string" && data.startsWith("P:")) {
    const [, action, idStr] = data.split(":");
    const perfumeId = Number(idStr);

    const chatId = ctx.chat?.id;
    const messageId = ctx.callbackQuery?.message?.message_id;
    if (!perfumeId || !chatId || !messageId) return;

    // Toggle NOTES / SEASON
    if (action === "NOTES" || action === "SEASON") {
      const field = action === "NOTES" ? "notes" : "season";
      const toggles = cardState.toggle(chatId, messageId, perfumeId, field);

      const perfume = getPerfumeById(perfumeId);
      if (!perfume) return ctx.reply("❌ Не знайшов аромат у БД.");

      const caption = buildPerfumeCaption(perfume, toggles);

      try {
        await ctx.telegram.editMessageCaption(
          chatId,
          messageId,
          undefined,
          caption,
          {
            ...perfumeCardKeyboard(perfumeId),
          },
        );
      } catch (e) {
        console.error("editMessageCaption error:", e?.message);
        await ctx.reply("⚠️ Не зміг оновити картку. Надсилаю нову нижче.");
        await sendPerfumeCard(ctx, perfume, toggles);
      }
      return;
    }

    // SIMILAR
   if (action === "SIMILAR") {
  const res = similarPerfumes(perfumeId, 3);

  if (!res.ok) {
    if (res.reason === "no_embeddings_table") {
      return ctx.reply("⚠️ 'Схоже' поки вимкнено (не згенерована таблиця embeddings).");
    }
    return ctx.reply("❌ Не зміг підібрати схожі.");
  }

  if (!res.items.length) return ctx.reply("❌ Схожих не знайшов.");

  await ctx.reply("✨ Схожі аромати:");
  for (const p of res.items) {
    await sendPerfumeCard(ctx, p, { notes: false, season: false });
  }
  return;
}

    return;
  }

  // ADMIN buttons (ADMIN_*)
  if (typeof data === "string" && data.startsWith("ADMIN_")) {
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

  // User menu actions
  if (data === ACTIONS.USER_PICK) {
    if (role !== "admin" && role !== "user") {
      return ctx.reply("⛔ Немає доступу.", shareContactKeyboard());
    }
    return onUserPickAction(ctx);
  }

  return ctx.reply("⚠️ Невідома дія кнопки.");
});

/* =========================
   Launch
========================= */
bot.launch().then(() => console.log("Bot started"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
