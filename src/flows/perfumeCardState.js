// src/flows/perfumeCardState.js
// Зберігає для кожного повідомлення-картки які блоки "відкриті"
// key = `${chatId}:${messageId}` -> { perfumeId, notes: bool, season: bool }

const map = new Map();

function key(chatId, messageId) {
  return `${chatId}:${messageId}`;
}

function get(chatId, messageId) {
  return map.get(key(chatId, messageId)) || null;
}

function set(chatId, messageId, state) {
  map.set(key(chatId, messageId), state);
  return state;
}

function remove(chatId, messageId) {
  map.delete(key(chatId, messageId));
}

function toggle(chatId, messageId, perfumeId, field /* "notes" | "season" */) {
  const k = key(chatId, messageId);
  const cur = map.get(k);

  // якщо це інший perfumeId — починаємо з дефолта
  const base =
    cur && cur.perfumeId === perfumeId
      ? { ...cur }
      : { perfumeId, notes: false, season: false };

  if (field === "notes") base.notes = !base.notes;
  if (field === "season") base.season = !base.season;

  map.set(k, base);
  return base;
}

module.exports = {
  get,
  set,
  remove,
  toggle,
};