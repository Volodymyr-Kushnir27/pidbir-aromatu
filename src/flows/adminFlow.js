const { ADMINS_PATH, USERS_PATH } = require("../config");
const adminsStore = require("../storage/adminsStore");
const usersStore = require("../storage/usersStore");
const { normalizePhone } = require("../utils/phone");
const { adminMenuKeyboard } = require("../ui/keyboards");

const adminState = new Map();

function getTgId(ctx) {
  return ctx.from?.id;
}

function setAdminState(ctx, state) {
  const tgId = getTgId(ctx);
  if (!tgId) return;
  adminState.set(tgId, state);
}

function clearAdminState(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return;
  adminState.delete(tgId);
}

function getAdminState(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return null;
  return adminState.get(tgId) || null;
}

async function replyAdmin(ctx, text) {
  return ctx.reply(text, adminMenuKeyboard());
}

function renderTgWithCount(u) {
  if (!u?.tg_id) return "";
  const count = Number(u?.search_count || 0);
  return ` | tg_id: ${u.tg_id} (${count})`;
}

async function onAdminAction(ctx, action) {
  switch (action) {
    case "ADD_USER":
      setAdminState(ctx, { step: "add_user_phone", role: "user" });
      return replyAdmin(ctx, "📱 Введіть номер телефону користувача:");

    case "ADD_ADMIN":
      setAdminState(ctx, { step: "add_admin_phone", role: "admin" });
      return replyAdmin(ctx, "📱 Введіть номер телефону адміністратора:");

    case "DEL_USER":
      setAdminState(ctx, { step: "delete_user_phone" });
      return replyAdmin(ctx, "🗑 Введіть номер користувача для видалення:");

    case "DEL_ADMIN":
      setAdminState(ctx, { step: "delete_admin_phone" });
      return replyAdmin(ctx, "🗑 Введіть номер адміністратора для видалення:");

    case "LIST_USERS": {
      const arr = usersStore.getAll(USERS_PATH);

      if (!arr.length) {
        return replyAdmin(ctx, "📋 Список продавців порожній.");
      }

      const text =
        "📋 Список продавців:\n\n" +
        arr
          .map((u, i) => {
            const fio = u.fio || "без ФІО";
            return `${i + 1}. ${u.phone} — ${fio}${renderTgWithCount(u)}`;
          })
          .join("\n");

      return replyAdmin(ctx, text);
    }

    case "LIST_ADMINS": {
      const arr = adminsStore.getAll(ADMINS_PATH);

      if (!arr.length) {
        return replyAdmin(ctx, "📋 Список адмінів порожній.");
      }

      const text =
        "👑 Список адмінів:\n\n" +
        arr
          .map((u, i) => {
            const fio = u.fio || "без ФІО";
            return `${i + 1}. ${u.phone} — ${fio}${renderTgWithCount(u)}`;
          })
          .join("\n");

      return replyAdmin(ctx, text);
    }

    default:
      return replyAdmin(ctx, "⚠️ Невідома адмін-дія.");
  }
}

async function onAdminText(ctx) {
  const st = getAdminState(ctx);
  if (!st?.step) return false;

  const text = String(ctx.message?.text || "").trim();

  if (st.step === "add_user_phone" || st.step === "add_admin_phone") {
    const phone = normalizePhone(text);

    if (!phone) {
      return ctx.reply("❌ Некоректний номер. Використайте формат +380...");
    }

    st.phone = phone;
    st.step = st.role === "user" ? "add_user_fio" : "add_admin_fio";
    setAdminState(ctx, st);

    return ctx.reply("✍️ Тепер введіть ФІО:");
  }

  if (st.step === "add_user_fio") {
    const fio = String(text || "").trim();

    if (!fio || fio.length < 3) {
      return ctx.reply("❌ Введіть коректне ФІО.");
    }

    const res = usersStore.addUser(USERS_PATH, {
      phone: st.phone,
      fio,
    });

    clearAdminState(ctx);
    return replyAdmin(ctx, res.ok ? "✅ Продавця успішно додано." : `❌ ${res.reason}`);
  }

  if (st.step === "add_admin_fio") {
    const fio = String(text || "").trim();

    if (!fio || fio.length < 3) {
      return ctx.reply("❌ Введіть коректне ФІО.");
    }

    const res = adminsStore.addAdmin(ADMINS_PATH, {
      phone: st.phone,
      fio,
    });

    clearAdminState(ctx);
    return replyAdmin(ctx, res.ok ? "✅ Адміна успішно додано." : `❌ ${res.reason}`);
  }

  if (st.step === "delete_user_phone") {
    const phone = normalizePhone(text);
    const res = usersStore.delUser(USERS_PATH, phone);

    clearAdminState(ctx);
    return replyAdmin(ctx, res.ok ? "🗑 Продавця видалено." : `❌ ${res.reason}`);
  }

  if (st.step === "delete_admin_phone") {
    const phone = normalizePhone(text);
    const res = adminsStore.delAdmin(ADMINS_PATH, phone);

    clearAdminState(ctx);
    return replyAdmin(ctx, res.ok ? "🗑 Адміна видалено." : `❌ ${res.reason}`);
  }

  return false;
}

module.exports = {
  onAdminAction,
  onAdminText,
  clearAdminState,
};