// key: chatId:messageId:perfumeId -> { notes:boolean, season:boolean }
const state = new Map();

function key(chatId, messageId, perfumeId) {
  return `${chatId}:${messageId}:${perfumeId}`;
}

function getState(chatId, messageId, perfumeId) {
  return state.get(key(chatId, messageId, perfumeId)) || { notes: false, season: false };
}

function setState(chatId, messageId, perfumeId, next) {
  state.set(key(chatId, messageId, perfumeId), next);
}

function toggle(chatId, messageId, perfumeId, field) {
  const cur = getState(chatId, messageId, perfumeId);
  const next = { ...cur, [field]: !cur[field] };
  setState(chatId, messageId, perfumeId, next);
  return next;
}

module.exports = { getState, setState, toggle };
