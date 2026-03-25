const { readJson, writeJsonAtomic, ensureJsonFile } = require("./jsonStore");
const { normalizePhone } = require("../utils/phone");

function readJSON(path) {
  ensureJsonFile(path, []);
  return readJson(path, []);
}

function writeJSON(path, data) {
  writeJsonAtomic(path, data);
}

function normalizeRecord(u = {}) {
  return {
    ...u,
    phone: normalizePhone(u.phone) || u.phone || "",
    fio: String(u.fio || "").trim(),
    tg_id: u.tg_id == null ? null : Number(u.tg_id),
    search_count: Number(u.search_count || 0),
  };
}

function getAll(path) {
  return readJSON(path).map(normalizeRecord);
}

function findByPhone(path, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;

  const arr = readJSON(path).map(normalizeRecord);
  return arr.find((u) => normalizePhone(u.phone) === phone) || null;
}

function findByTgId(path, tgIdRaw) {
  const tgId = Number(tgIdRaw);
  if (!tgId) return null;

  const arr = readJSON(path).map(normalizeRecord);
  return arr.find((u) => Number(u.tg_id) === tgId) || null;
}

function attachTgId(path, phoneRaw, tgId) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return false;

  const arr = readJSON(path).map(normalizeRecord);
  const idx = arr.findIndex((u) => normalizePhone(u.phone) === phone);
  if (idx === -1) return false;

  arr[idx].phone = phone;
  arr[idx].tg_id = Number(tgId);
  arr[idx].search_count = Number(arr[idx].search_count || 0);

  writeJSON(path, arr);
  return true;
}

function setFio(path, phoneRaw, fio) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return false;

  const arr = readJSON(path).map(normalizeRecord);
  const idx = arr.findIndex((u) => normalizePhone(u.phone) === phone);
  if (idx === -1) return false;

  arr[idx].phone = phone;
  arr[idx].fio = String(fio || "").trim();
  arr[idx].search_count = Number(arr[idx].search_count || 0);

  writeJSON(path, arr);
  return true;
}

function incrementSearchCountByTgId(path, tgIdRaw, step = 1) {
  const tgId = Number(tgIdRaw);
  if (!tgId) return false;

  const arr = readJSON(path).map(normalizeRecord);
  const idx = arr.findIndex((u) => Number(u.tg_id) === tgId);
  if (idx === -1) return false;

  arr[idx].search_count = Number(arr[idx].search_count || 0) + Number(step || 1);

  writeJSON(path, arr);
  return true;
}

function addAdmin(path, payloadOrPhone) {
  const isObject =
    payloadOrPhone && typeof payloadOrPhone === "object" && !Array.isArray(payloadOrPhone);

  const phoneRaw = isObject ? payloadOrPhone.phone : payloadOrPhone;
  const fioRaw = isObject ? payloadOrPhone.fio : "";

  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, reason: "Некоректний номер." };

  const arr = readJSON(path).map(normalizeRecord);
  if (arr.some((u) => normalizePhone(u.phone) === phone)) {
    return { ok: false, reason: "Адмін уже існує." };
  }

  arr.push({
    phone,
    fio: String(fioRaw || "").trim(),
    tg_id: null,
    search_count: 0,
  });

  writeJSON(path, arr);
  return { ok: true };
}

function delAdmin(path, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, reason: "Некоректний номер." };

  const arr = readJSON(path).map(normalizeRecord);
  const next = arr.filter((u) => normalizePhone(u.phone) !== phone);

  if (next.length === arr.length) {
    return { ok: false, reason: "Адміна не знайдено." };
  }

  writeJSON(path, next);
  return { ok: true };
}

function deleteAdmin(path, phoneRaw) {
  return delAdmin(path, phoneRaw);
}

module.exports = {
  readJSON,
  writeJSON,
  getAll,
  findByPhone,
  findByTgId,
  attachTgId,
  setFio,
  incrementSearchCountByTgId,
  addAdmin,
  delAdmin,
  deleteAdmin,
};