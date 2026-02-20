const { Markup } = require("telegraf");
const { ACTIONS } = require("../config");

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Додати продавця", ACTIONS.ADD_USER)],
    [Markup.button.callback("🚫 Видалити продавця", ACTIONS.DEL_USER)],
    [Markup.button.callback("📋 Список продавців", ACTIONS.LIST_USERS)],
    [Markup.button.callback("✅ Додати адміна", ACTIONS.ADD_ADMIN)],
    [Markup.button.callback("🚫 Видалити адміна", ACTIONS.DEL_ADMIN)],
    [Markup.button.callback("📋 Список адмінів", ACTIONS.LIST_ADMINS)]
  ]);
}

function userMenuKeyboard() {
  return Markup.inlineKeyboard([ 
    [Markup.button.callback("Пошук", ACTIONS.BACK_HOME)],
  ]);
}

function shareContactKeyboard() {
  // contact request must be reply keyboard
  return Markup.keyboard([[Markup.button.contactRequest("📱 Поділитися номером")]])
    .resize()
    .oneTime();
}

function backHomeKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("⬅️ Назад", ACTIONS.BACK_HOME)]]);
}

function exitPickKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("❌ Вийти з підбору", ACTIONS.EXIT_PICK)],
    [Markup.button.callback("⬅️ Назад", ACTIONS.BACK_HOME)]
  ]);
}

function perfumeCardKeyboard(perfumeId) {
  // callback_data коротке і стабільне
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📄 Ноти", `P:NOTES:${perfumeId}`),
      Markup.button.callback("🌤️ Сезон", `P:SEASON:${perfumeId}`),
    ],
    [Markup.button.callback("✨ Схоже", `P:SIMILAR:${perfumeId}`)],
  ]);
}

module.exports.perfumeCardKeyboard = perfumeCardKeyboard;


module.exports = {
  adminMenuKeyboard,
  userMenuKeyboard,
  shareContactKeyboard,
  backHomeKeyboard,
  exitPickKeyboard
};
