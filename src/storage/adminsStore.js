// src/storage/usersStore.js
const fs = require("fs");
const { normalizePhone } = require("../utils/phone");

function readJSON(path) {
  try {
    const t = fs.readFileSync(path, "utf8");
    return JSON.parse(t || "[]");
  } catch {
    return [];
  }
}

function writeJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function findByPhone(path, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;

  const arr = readJSON(path);
  return arr.find((u) => normalizePhone(u.phone) === phone) || null;
}

function attachTgId(path, phoneRaw, tgId) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return false;

  const arr = readJSON(path);
  const idx = arr.findIndex((u) => normalizePhone(u.phone) === phone);
  if (idx === -1) return false;

  arr[idx].phone = phone; // фіксуємо формат
  arr[idx].tg_id = Number(tgId);

  writeJSON(path, arr);
  return true;
}

function setFio(path, phoneRaw, fio) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return false;

  const arr = readJSON(path);
  const idx = arr.findIndex((u) => normalizePhone(u.phone) === phone);
  if (idx === -1) return false;

  arr[idx].phone = phone;
  arr[idx].fio = String(fio || "").trim();

  writeJSON(path, arr);
  return true;
}

module.exports = {
  readJSON,
  writeJSON,
  findByPhone,
  attachTgId,
  setFio,
};