require("dotenv").config();

process.on("unhandledRejection", (e) => {
  console.error("unhandledRejection:", e);
});

process.on("uncaughtException", (e) => {
  console.error("uncaughtException:", e);
});

const { Telegraf } = require("telegraf");

const {
  BOT_TOKEN,
  ADMINS_PATH,
  USERS_PATH,
  ACTIONS,
  SUPER_ADMIN_TG_ID,
} = require("./config");

const { getRole } = require("./middleware/auth");

const adminsStore = require("./storage/adminsStore");
const usersStore = require("./storage/usersStore");

const {
  adminMenuKeyboard,
  userMenuKeyboard,
  shareContactKeyboard,
} = require("./ui/keyboards");

const { normalizePhone } = require("./utils/phone");

const {
  onAdminAction,
  onAdminText,
  clearAdminState,
  cancelAdminFlowIfAny,
} = require("./flows/adminFlow");

const {
  onUserPickAction,
  onUserText,
  disableMode,
} = require("./flows/perfumeChatFlow");

const {
  onSimilarAction,
  onSimilarMoreAction,
} = require("./flows/similarFlow");

const { onDetailAction } = require("./flows/detailFlow");

if (!BOT_TOKEN) throw new Error("BOT_TOKEN missing");

const bot = new Telegraf(BOT_TOKEN);

bot.catch((err, ctx) => {
  console.error("Telegraf error:", err);
  try {
    console.error("Update:", JSON.stringify(ctx.update, null, 2));
  } catch {}
});

/* =========================
   Registration State
========================= */
const regState = new Map();
// tgId -> { step: "fio", phone }

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

function isSuperAdmin(ctx) {
  return Number(ctx.from?.id || 0) === Number(SUPER_ADMIN_TG_ID || 0);
}

function getEffectiveRole(ctx) {
  if (isSuperAdmin(ctx)) return "admin";
  return getRole(ctx);
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

  return false;
}

function setFio(kind, phone, fio) {
  if (kind === "admin" && typeof adminsStore.setFio === "function") {
    return adminsStore.setFio(ADMINS_PATH, phone, fio);
  }

  if (kind === "user" && typeof usersStore.setFio === "function") {
    return usersStore.setFio(USERS_PATH, phone, fio);
  }

  return false;
}

async function showHome(ctx) {
  const role = getEffectiveRole(ctx);

  try {
    clearAdminState(ctx);
  } catch {}

  try {
    disableMode(ctx);
  } catch {}

  if (role === "admin") {
    await ctx.reply("✅ Авторизація успішна.", {
      reply_markup: { remove_keyboard: true },
    });

    return ctx.reply("👑 Admin Menu", adminMenuKeyboard());
  }

  if (role === "user") {
    await ctx.reply("✅ Авторизація успішна.", {
      reply_markup: { remove_keyboard: true },
    });

    return ctx.reply("Оберіть режим роботи:", userMenuKeyboard());
  }

  return ctx.reply(
    "⛔ Немає доступу.\n\n" +
      "1️⃣ Надішліть номер телефону кнопкою «Поділитися номером»\n" +
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
   Contact registration
========================= */
bot.on("contact", async (ctx) => {
  if (isSuperAdmin(ctx)) {
    return showHome(ctx);
  }

  const contact = ctx.message?.contact;
  if (!contact) return;

  if (contact.user_id && ctx.from?.id && contact.user_id !== ctx.from.id) {
    return ctx.reply("Будь ласка, поділіться СВОЇМ номером через кнопку.");
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) return ctx.reply("❌ Некоректний номер.");

  const found = findByPhone(phone);
  if (!found) {
    return ctx.reply("⛔ Номер не знайдено у списку. Зверніться до адміна.");
  }

  if (found.record?.fio) {
    attachTgId(found.kind, found.phone, ctx.from.id);
    return showHome(ctx);
  }

  regState.set(ctx.from.id, { step: "fio", phone: found.phone });
  return ctx.reply("✍️ Введіть ваше ФІО (Прізвище Ім’я).");
});

/* =========================
   Text router
========================= */
bot.on("text", async (ctx) => {
  const role = getEffectiveRole(ctx);
  const tgId = ctx.from?.id;
  const text = String(ctx.message?.text || "").trim();

  if (!tgId) return;

  // super admin / admin flow
  if (role === "admin") {
    const handledAdmin = await onAdminText(ctx);
    if (handledAdmin) return;
  }

  // registration flow тільки для не-super-admin
  if (!isSuperAdmin(ctx)) {
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

    // manual phone input
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
  }

  // perfume/user flow
  if (role === "admin" || role === "user") {
    const handledUser = await onUserText(ctx);
    if (handledUser) return;
  }

  if (text === "/start" || text === "/home") {
    return showHome(ctx);
  }

  return ctx.reply("Використайте /start щоб відкрити меню.");
});

/* =========================
   Callback router
========================= */
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery?.data;
  await safeAnswerCb(ctx);
  if (!data) return;

  const role = getEffectiveRole(ctx);

  if (String(data).startsWith("SIMILAR_MORE:")) {
    const perfumeId = Number(String(data).split(":")[1] || 0);

    if (!perfumeId) {
      return ctx.reply("❌ Некоректний ID аромату.");
    }

    return onSimilarMoreAction(ctx, perfumeId);
  }

  if (String(data).startsWith("SIMILAR:")) {
    const perfumeId = Number(String(data).split(":")[1] || 0);

    if (!perfumeId) {
      return ctx.reply("❌ Некоректний ID аромату.");
    }

    return onSimilarAction(ctx, perfumeId);
  }

  if (String(data).startsWith("DETAIL:")) {
    const perfumeId = Number(String(data).split(":")[1] || 0);

    if (!perfumeId) {
      return ctx.reply("❌ Некоректний ID аромату.");
    }

    return onDetailAction(ctx, perfumeId);
  }

if (data === ACTIONS.BACK_HOME) {
  try {
    await cancelAdminFlowIfAny(ctx, true);
  } catch {}
  return showHome(ctx);
}

  if (data === ACTIONS.EXIT_PICK) {
  try {
    await cancelAdminFlowIfAny(ctx, true);
  } catch {}

  try {
    disableMode(ctx);
  } catch {}

    if (role === "admin") {
      return ctx.reply("✅ Режим підбору вимкнено.", adminMenuKeyboard());
    }

    if (role === "user") {
      return ctx.reply("✅ Режим підбору вимкнено.", userMenuKeyboard());
    }

    return ctx.reply("✅ Режим підбору вимкнено.");
  }

  if (String(data).startsWith("ADMIN_")) {
    if (role !== "admin") {
      return ctx.reply("⛔ Доступ тільки для адміна.");
    }

    const map = {
      ADMIN_ADD_USER: "ADD_USER",
      ADMIN_DEL_USER: "DEL_USER",
      ADMIN_LIST_USERS: "LIST_USERS",
      ADMIN_ADD_ADMIN: "ADD_ADMIN",
      ADMIN_DEL_ADMIN: "DEL_ADMIN",
      ADMIN_LIST_ADMINS: "LIST_ADMINS",
    };

    const action = map[data];
    if (!action) {
      return ctx.reply("⚠️ Невідома адмін-дія.");
    }

    return onAdminAction(ctx, action);
  }

  if (data === ACTIONS.USER_PICK) {
  if (role !== "admin" && role !== "user") {
    return ctx.reply("⛔ Немає доступу.", shareContactKeyboard());
  }

  try {
    await cancelAdminFlowIfAny(ctx, true);
  } catch {}

  return onUserPickAction(ctx);
}

  return ctx.reply("⚠️ Невідома дія кнопки.");
});

/* =========================
   Launch
========================= */
bot.launch().then(() => {
  console.log("Bot started");
  console.log("SUPER_ADMIN_TG_ID =", SUPER_ADMIN_TG_ID);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));