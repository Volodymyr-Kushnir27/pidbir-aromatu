const { ADMINS_PATH, USERS_PATH, STATES } = require("../config");
const adminsStore = require("../storage/adminsStore");
const usersStore = require("../storage/usersStore");
const { normalizePhone } = require("../utils/phone");

const adminState = new Map();
// tgId -> state

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

async function onAdminAction(ctx, action) {
  switch (action) {
    case "ADD_USER":
      setAdminState(ctx, { step: STATES.ADD_USER_WAIT });
      return ctx.reply("Введіть номер user у форматі +380...");
    case "DEL_USER":
      setAdminState(ctx, { step: STATES.DEL_USER_WAIT });
      return ctx.reply("Введіть номер user для видалення:");
    case "LIST_USERS": {
      const arr = usersStore.readJSON(USERS_PATH);
      if (!arr.length) return ctx.reply("Список user порожній.");
      const text = arr
        .map((u, i) => `${i + 1}. ${u.phone} | ${u.fio || "—"} | tg_id: ${u.tg_id || "—"}`)
        .join("\n");
      return ctx.reply(text);
    }
    case "ADD_ADMIN":
      setAdminState(ctx, { step: STATES.ADD_ADMIN_WAIT });
      return ctx.reply("Введіть номер admin у форматі +380...");
    case "DEL_ADMIN":
      setAdminState(ctx, { step: STATES.DEL_ADMIN_WAIT });
      return ctx.reply("Введіть номер admin для видалення:");
    case "LIST_ADMINS": {
      const arr = adminsStore.readJSON(ADMINS_PATH);
      if (!arr.length) return ctx.reply("Список admin порожній.");
      const text = arr
        .map((u, i) => `${i + 1}. ${u.phone} | ${u.fio || "—"} | tg_id: ${u.tg_id || "—"}`)
        .join("\n");
      return ctx.reply(text);
    }
    default:
      return ctx.reply("Невідома адмін-дія.");
  }
}

async function onAdminText(ctx) {
  const st = getAdminState(ctx);
  if (!st?.step) return false;

  const text = String(ctx.message?.text || "").trim();
  const phone = normalizePhone(text);

  if (!phone) {
    return ctx.reply("❌ Некоректний номер. Використайте формат +380...");
  }

  switch (st.step) {
    case STATES.ADD_USER: // safeguard
    case STATES.ADD_USER_WAIT: {
      const res = usersStore.addUser(USERS_PATH, phone);
      clearAdminState(ctx);
      return ctx.reply(res.ok ? "✅ User доданий." : `❌ ${res.reason}`);
    }

    case STATES.DEL_USER_WAIT: {
      const res = usersStore.delUser(USERS_PATH, phone);
      clearAdminState(ctx);
      return ctx.reply(res.ok ? "✅ User видалений." : `❌ ${res.reason}`);
    }

    case STATES.ADD_ADMIN_WAIT: {
      const res = adminsStore.addAdmin(ADMINS_PATH, phone);
      clearAdminState(ctx);
      return ctx.reply(res.ok ? "✅ Admin доданий." : `❌ ${res.reason}`);
    }

    case STATES.DEL_ADMIN_WAIT: {
      const res = adminsStore.delAdmin(ADMINS_PATH, phone);
      clearAdminState(ctx);
      return ctx.reply(res.ok ? "✅ Admin видалений." : `❌ ${res.reason}`);
    }

    default:
      return false;
  }
}

module.exports = {
  onAdminAction,
  onAdminText,
  clearAdminState,
};