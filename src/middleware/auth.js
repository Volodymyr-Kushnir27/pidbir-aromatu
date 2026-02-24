// src/middleware/auth.js
const { ADMINS_PATH, USERS_PATH } = require("../config");
const adminsStore = require("../storage/adminsStore");
const usersStore = require("../storage/usersStore");

function getRole(ctx) {
  const tgId = Number(ctx.from?.id);
  if (!tgId) return "guest";

  const admins = adminsStore.readJSON(ADMINS_PATH);
  const users = usersStore.readJSON(USERS_PATH);

  const isAdmin = admins.some((a) => Number(a.tg_id) === tgId);
  if (isAdmin) return "admin";

  const isUser = users.some((u) => Number(u.tg_id) === tgId);
  if (isUser) return "user";

  return "guest";
}

module.exports = { getRole };