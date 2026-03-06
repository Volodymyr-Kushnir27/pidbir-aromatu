const { ADMINS_PATH, USERS_PATH } = require("../config");
const adminsStore = require("../storage/adminsStore");
const usersStore = require("../storage/usersStore");

function getRole(ctx) {
  const tgId = Number(ctx.from?.id || 0);
  if (!tgId) return "guest";

  const admins = adminsStore.readJSON(ADMINS_PATH);
  if (admins.some((a) => Number(a.tg_id) === tgId)) return "admin";

  const users = usersStore.readJSON(USERS_PATH);
  if (users.some((u) => Number(u.tg_id) === tgId)) return "user";

  return "guest";
}

module.exports = { getRole };