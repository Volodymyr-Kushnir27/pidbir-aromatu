// src/middleware/auth.js
const { ADMINS_PATH, USERS_PATH } = require("../config");
const admins = require("../storage/adminsStore");
const users = require("../storage/usersStore");

/**
 * Повертає "admin" | "user" | "guest"
 */
function getRole(ctx) {
  const tgId = ctx.from?.id;
  const superId = Number(process.env.SUPER_ADMIN_TG_ID || 0);
if (superId && Number(tgId) === superId) return "admin";
  if (!tgId) return "guest";

  // adminsStore може мати сигнатуру: isAdminByTgId(filePath, tgId) або isAdminByTgId(tgId)
  const isAdmin =
    typeof admins.isAdminByTgId === "function"
      ? (admins.isAdminByTgId.length >= 2
          ? admins.isAdminByTgId(ADMINS_PATH, tgId)
          : admins.isAdminByTgId(tgId))
      : false;

  if (isAdmin) return "admin";

  const isUser =
    typeof users.isUserByTgId === "function"
      ? (users.isUserByTgId.length >= 2
          ? users.isUserByTgId(USERS_PATH, tgId)
          : users.isUserByTgId(tgId))
      : false;

  if (isUser) return "user";

  return "guest";
}

module.exports = { getRole };