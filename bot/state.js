const state = new Map();

function get(userId) {
  return state.get(userId);
}

function set(userId, value) {
  state.set(userId, value);
}

function clear(userId) {
  state.delete(userId);
}

module.exports = { get, set, clear };
