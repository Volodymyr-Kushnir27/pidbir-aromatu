// src/storage/usersStore.js
const fs = require("fs");
const path = require("path");

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw || "[]");

    // ✅ accept both array and { users: [...] }
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.users)) return parsed.users;

    return fallback;
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function list(filePath) {
  return readJsonSafe(filePath, []);
}

function findByPhone(filePath, phone) {
  const arr = list(filePath);
  return arr.find((u) => String(u.phone || "") === String(phone || "")) || null;
}

function upsertByPhone(filePath, record) {
  const arr = list(filePath);
  const phone = String(record.phone || "");
  if (!phone) throw new Error("upsertByPhone: phone missing");

  const idx = arr.findIndex((u) => String(u.phone || "") === phone);
  if (idx === -1) arr.push(record);
  else arr[idx] = { ...arr[idx], ...record };

  writeJsonSafe(filePath, arr);
  return true;
}

function removeByPhone(filePath, phone) {
  const arr = list(filePath);
  const before = arr.length;
  const filtered = arr.filter((u) => String(u.phone || "") !== String(phone || ""));
  writeJsonSafe(filePath, filtered);
  return filtered.length !== before;
}

function attachTgIdByPhone(filePath, phone, tgId) {
  return upsertByPhone(filePath, { phone, tg_id: tgId });
}

function setFioByPhone(filePath, phone, fio) {
  return upsertByPhone(filePath, { phone, fio });
}

function isUserByTgId(arg1, arg2) {
  const filePath = typeof arg1 === "string" ? arg1 : null;
  const tgId = typeof arg1 === "string" ? arg2 : arg1;

  if (!tgId) return false;

  const arr = list(filePath || require("../config").USERS_PATH);
  return arr.some((u) => Number(u.tg_id) === Number(tgId));
}

module.exports = {
  list,
  findByPhone,
  upsertByPhone,
  removeByPhone,
  attachTgIdByPhone,
  setFioByPhone,
  isUserByTgId,
};