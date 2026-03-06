const { ACTIONS, ADMINS_PATH, USERS_PATH } = require("../config");

const adminsStore = require("../storage/adminsStore");
const usersStore = require("../storage/usersStore");

const { normalizePhone } = require("../utils/phone");

const { adminMenuKeyboard } = require("../ui/keyboards");

const state = new Map();
// tgId -> { step, role, phone }

function clearAdminState(ctx) {
  const id = ctx.from?.id;
  if (id) state.delete(id);
}

function getState(ctx) {
  const id = ctx.from?.id;
  if (!id) return null;
  return state.get(id);
}

function setState(ctx, payload) {
  const id = ctx.from?.id;
  if (!id) return;
  state.set(id, payload);
}

async function onAdminAction(ctx, action) {
  const tgId = ctx.from?.id;

  if (!tgId) return;

  if (action === "ADD_USER") {
    setState(ctx, {
      step: "phone",
      role: "user",
    });

    return ctx.reply(
      "📱 Введіть номер телефону користувача:",
      adminMenuKeyboard(),
    );
  }

  if (action === "ADD_ADMIN") {
    setState(ctx, {
      step: "phone",
      role: "admin",
    });

    return ctx.reply(
      "📱 Введіть номер телефону адміністратора:",
      adminMenuKeyboard(),
    );
  }

  if (action === "DEL_USER") {
    setState(ctx, {
      step: "delete_user",
    });

    return ctx.reply(
      "📱 Введіть номер користувача для видалення:",
      adminMenuKeyboard(),
    );
  }

  if (action === "DEL_ADMIN") {
    setState(ctx, {
      step: "delete_admin",
    });

    return ctx.reply(
      "📱 Введіть номер адміністратора для видалення:",
      adminMenuKeyboard(),
    );
  }

  if (action === "LIST_USERS") {
    const list = usersStore.getAll(USERS_PATH);

    if (!list.length) {
      return ctx.reply("Список користувачів порожній", adminMenuKeyboard());
    }

    const text = list
      .map((u) => `${u.phone} — ${u.fio || "без ФІО"}`)
      .join("\n");

    return ctx.reply(`👥 Users:\n\n${text}`, adminMenuKeyboard());
  }

  if (action === "LIST_ADMINS") {
    const list = adminsStore.getAll(ADMINS_PATH);

    if (!list.length) {
      return ctx.reply("Список адмінів порожній", adminMenuKeyboard());
    }

    const text = list
      .map((u) => `${u.phone} — ${u.fio || "без ФІО"}`)
      .join("\n");

    return ctx.reply(`👑 Admins:\n\n${text}`, adminMenuKeyboard());
  }
}

async function onAdminText(ctx) {
  const st = getState(ctx);
  if (!st) return false;

  const text = String(ctx.message?.text || "").trim();

  if (st.step === "phone") {
    const phone = normalizePhone(text);

    if (!phone) {
      return ctx.reply("❌ Некоректний номер телефону");
    }

    st.phone = phone;
    st.step = "fio";

    setState(ctx, st);

    return ctx.reply("✍️ Тепер введіть ФІО:");
  }

  if (st.step === "fio") {
    const fio = text;

    if (st.role === "user") {
      usersStore.addUser(USERS_PATH, {
        phone: st.phone,
        fio,
      });
    }

    if (st.role === "admin") {
      adminsStore.addAdmin(ADMINS_PATH, {
        phone: st.phone,
        fio,
      });
    }

    clearAdminState(ctx);

    return ctx.reply(
      "✅ Успішно додано",
      adminMenuKeyboard(),
    );
  }

  if (st.step === "delete_user") {
    const phone = normalizePhone(text);

    usersStore.deleteUser(USERS_PATH, phone);

    clearAdminState(ctx);

    return ctx.reply(
      "🗑 Користувача видалено",
      adminMenuKeyboard(),
    );
  }

  if (st.step === "delete_admin") {
    const phone = normalizePhone(text);

    adminsStore.deleteAdmin(ADMINS_PATH, phone);

    clearAdminState(ctx);

    return ctx.reply(
      "🗑 Адміна видалено",
      adminMenuKeyboard(),
    );
  }

  return false;
}

module.exports = {
  onAdminAction,
  onAdminText,
  clearAdminState,
};