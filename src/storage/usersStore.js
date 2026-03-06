const { readJson, writeJsonAtomic, ensureJsonFile } = require("./jsonStore");
const { normalizePhone } = require("../utils/phone");

function readJSON(path) {
  ensureJsonFile(path, []);
  return readJson(path, []);
}

function writeJSON(path, data) {
  writeJsonAtomic(path, data);
}

function getAll(path) {
  return readJSON(path);
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

  arr[idx].phone = phone;
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

function addUser(path, payloadOrPhone) {
  const isObject =
    payloadOrPhone && typeof payloadOrPhone === "object" && !Array.isArray(payloadOrPhone);

  const phoneRaw = isObject ? payloadOrPhone.phone : payloadOrPhone;
  const fioRaw = isObject ? payloadOrPhone.fio : "";

  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, reason: "Некоректний номер." };

  const arr = readJSON(path);
  if (arr.some((u) => normalizePhone(u.phone) === phone)) {
    return { ok: false, reason: "Користувач уже існує." };
  }

  arr.push({
    phone,
    fio: String(fioRaw || "").trim(),
    tg_id: null,
  });

  writeJSON(path, arr);
  return { ok: true };
}

function delUser(path, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, reason: "Некоректний номер." };

  const arr = readJSON(path);
  const next = arr.filter((u) => normalizePhone(u.phone) !== phone);

  if (next.length === arr.length) {
    return { ok: false, reason: "Користувача не знайдено." };
  }

  writeJSON(path, next);
  return { ok: true };
}

function deleteUser(path, phoneRaw) {
  return delUser(path, phoneRaw);
}

module.exports = {
  readJSON,
  writeJSON,
  getAll,
  findByPhone,
  attachTgId,
  setFio,
  addUser,
  delUser,
  deleteUser,
};