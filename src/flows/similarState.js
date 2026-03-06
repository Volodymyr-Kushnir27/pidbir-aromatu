const state = new Map();
// key = `${chatId}:${baseId}`
// value = { items: [], offset: 0, sentIds: [] }

function makeKey(chatId, baseId) {
  return `${chatId}:${baseId}`;
}

function setSimilarState(chatId, baseId, payload) {
  state.set(makeKey(chatId, baseId), payload);
}

function getSimilarState(chatId, baseId) {
  return state.get(makeKey(chatId, baseId)) || null;
}

function clearSimilarState(chatId, baseId) {
  state.delete(makeKey(chatId, baseId));
}

module.exports = {
  setSimilarState,
  getSimilarState,
  clearSimilarState,
};