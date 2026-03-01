// src/ui/keyboards.js
const { Markup } = require("telegraf");
const { ACTIONS } = require("../config");

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Додати продавця", ACTIONS.ADD_USER)],
    [Markup.button.callback("🚫 Видалити продавця", ACTIONS.DEL_USER)],
    [Markup.button.callback("📋 Список продавців", ACTIONS.LIST_USERS)],
    [Markup.button.callback("✅ Додати адміна", ACTIONS.ADD_ADMIN)],
    [Markup.button.callback("🚫 Видалити адміна", ACTIONS.DEL_ADMIN)],
    [Markup.button.callback("📋 Список адмінів", ACTIONS.LIST_ADMINS)],
  ]);
}

function userMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✨ Підбір аромату", ACTIONS.USER_PICK)],
    // [Markup.button.callback("📄 Ноти", ACTIONS.USER_NOTES)],
  ]);
}

function shareContactKeyboard() {
  return Markup.keyboard([[Markup.button.contactRequest("📱 Поділитися номером")]])
    .resize()
    .oneTime();
}

function backHomeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ Назад", ACTIONS.BACK_HOME)],
  ]);
}

function exitPickKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("❌ Вийти з режиму", ACTIONS.EXIT_PICK)],
    [Markup.button.callback("⬅️ Назад", ACTIONS.BACK_HOME)],
  ]);
}

/**
 * state: { notes:boolean, season:boolean }
 * (якщо state не передали — кнопки просто без чекмарків)
 */
function perfumeCardKeyboard(perfumeId, state = { notes: false, season: false }) {
  const id = Number(perfumeId);

  const notesText = state?.notes ? "✅ Ноти" : "✨ Ноти";
  const seasonText = state?.season ? "✅ Сезон" : "🌤 Сезон";

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(notesText, `TOGGLE_NOTES:${id}`),
      Markup.button.callback(seasonText, `TOGGLE_SEASON:${id}`),
    ],
    [Markup.button.callback("✨ Схоже", `SIMILAR:${id}`)],
  ]);
}

module.exports = {
  adminMenuKeyboard,
  userMenuKeyboard,
  shareContactKeyboard,
  backHomeKeyboard,
  exitPickKeyboard,
  perfumeCardKeyboard,
};