const { Markup } = require("telegraf");
const { ACTIONS } = require("../config");

function adminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("➕ Додати user", ACTIONS.ADD_USER),
      Markup.button.callback("➖ Видалити user", ACTIONS.DEL_USER),
    ],
    [
      Markup.button.callback("📋 Список users", ACTIONS.LIST_USERS),
    ],
    [
      Markup.button.callback("➕ Додати admin", ACTIONS.ADD_ADMIN),
      Markup.button.callback("➖ Видалити admin", ACTIONS.DEL_ADMIN),
    ],
    [
      Markup.button.callback("📋 Список admins", ACTIONS.LIST_ADMINS),
    ],
    [
      Markup.button.callback("🌿 Підбір аромату", ACTIONS.USER_PICK),
    ],
  ]);
}

function userMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🌿 Підбір аромату", ACTIONS.USER_PICK)],
  ]);
}

function shareContactKeyboard() {
  return Markup.keyboard([
    [Markup.button.contactRequest("📱 Поділитися номером")],
  ])
    .resize()
    .oneTime();
}

function perfumeCardKeyboard(item) {
  const id = item?.id;
  if (!id) return undefined;

  return Markup.inlineKeyboard([
    [Markup.button.callback("🔁 Схожі", `SIMILAR:${id}`)],
  ]);
}

module.exports = {
  adminMenuKeyboard,
  userMenuKeyboard,
  shareContactKeyboard,
  perfumeCardKeyboard,
};