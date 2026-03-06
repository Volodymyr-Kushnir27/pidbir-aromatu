const { readJson, writeJsonAtomic, ensureJsonFile } = require("./jsonStore");
const { normalizePhone } = require("../utils/phone");

function readJSON(path) {
  ensureJsonFile(path, []);
  return readJson(path, []);
}

function writeJSON(path, data) {
  writeJsonAtomic(path, data);
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

function addUser(path, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, reason: "Некоректний номер." };

  const arr = readJSON(path);
  if (arr.some((u) => normalizePhone(u.phone) === phone)) {
    return { ok: false, reason: "Користувач уже існує." };
  }

  arr.push({ phone, fio: "", tg_id: null });
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

module.exports = {
  readJSON,
  writeJSON,
  findByPhone,
  attachTgId,
  setFio,
  addUser,
  delUser,
};