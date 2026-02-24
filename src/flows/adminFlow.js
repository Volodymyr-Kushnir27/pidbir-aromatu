// src/flows/adminFlow.js
const fs = require("fs");
const path = require("path");

const { ADMINS_PATH, USERS_PATH } = require("../config");
const { adminMenuKeyboard } = require("../ui/keyboards");
const { normalizePhone } = require("../utils/phone");

const adminsStore = require("../storage/adminsStore");
const usersStore = require("../storage/usersStore");

/* =========================
   In-memory admin state
   tgId -> { mode, step, phone }
========================= */
const adminState = new Map();

/* =========================
   JSON helpers (fallback)
========================= */
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function fallbackFindByPhone(filePath, phone) {
  const list = readJsonSafe(filePath, []);
  return list.find((x) => String(x.phone || "") === phone) || null;
}

function fallbackUpsert(filePath, record) {
  const list = readJsonSafe(filePath, []);
  const idx = list.findIndex((x) => String(x.phone || "") === String(record.phone || ""));
  if (idx === -1) list.push(record);
  else list[idx] = { ...list[idx], ...record };
  writeJsonSafe(filePath, list);
}

function fallbackRemoveByPhone(filePath, phone) {
  const list = readJsonSafe(filePath, []);
  const before = list.length;
  const filtered = list.filter((x) => String(x.phone || "") !== phone);
  writeJsonSafe(filePath, filtered);
  return filtered.length !== before;
}

function fallbackList(filePath) {
  return readJsonSafe(filePath, []);
}

/* =========================
   Normalizers / validators
========================= */
function normalizeFio(raw) {
  const fio = String(raw || "").trim().replace(/\s+/g, " ");
  if (fio.length < 5) return null;
  if (fio.split(" ").length < 2) return null;
  return fio;
}

/* =========================
   State helpers
========================= */
function clearAdminState(ctx) {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  adminState.delete(tgId);
}

/* =========================
   Menu helper
========================= */
async function showAdminMenu(ctx, extraText = null) {
  if (extraText) await ctx.reply(extraText);
  return ctx.reply("👑 Admin Menu", adminMenuKeyboard());
}

/* =========================
   Store wrappers (use store if exists, else fallback)
========================= */
function findUserByPhone(phone) {
  return usersStore.findByPhone ? usersStore.findByPhone(USERS_PATH, phone) : fallbackFindByPhone(USERS_PATH, phone);
}
function findAdminByPhone(phone) {
  return adminsStore.findByPhone ? adminsStore.findByPhone(ADMINS_PATH, phone) : fallbackFindByPhone(ADMINS_PATH, phone);
}

function upsertUser(rec) {
  if (usersStore.upsertByPhone) return usersStore.upsertByPhone(USERS_PATH, rec);
  return fallbackUpsert(USERS_PATH, rec);
}
function upsertAdmin(rec) {
  if (adminsStore.upsertByPhone) return adminsStore.upsertByPhone(ADMINS_PATH, rec);
  return fallbackUpsert(ADMINS_PATH, rec);
}

function removeUserByPhone(phone) {
  if (usersStore.removeByPhone) return usersStore.removeByPhone(USERS_PATH, phone);
  return fallbackRemoveByPhone(USERS_PATH, phone);
}
function removeAdminByPhone(phone) {
  if (adminsStore.removeByPhone) return adminsStore.removeByPhone(ADMINS_PATH, phone);
  return fallbackRemoveByPhone(ADMINS_PATH, phone);
}

function listUsers() {
  if (usersStore.list) return usersStore.list(USERS_PATH);
  return fallbackList(USERS_PATH);
}
function listAdmins() {
  if (adminsStore.list) return adminsStore.list(ADMINS_PATH);
  return fallbackList(ADMINS_PATH);
}

/* =========================
   Public API
========================= */
async function onAdminAction(ctx, action) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  // Start flows
  if (action === "ADD_USER") {
    adminState.set(tgId, { mode: "ADD_USER", step: "phone" });
    return ctx.reply("✅ Додати продавця\n\n1) Введіть номер у форматі +380XXXXXXXXX (можна з пробілами).");
  }

  if (action === "DEL_USER") {
    adminState.set(tgId, { mode: "DEL_USER", step: "phone" });
    return ctx.reply("⛔ Видалити продавця\n\nВведіть номер у форматі +380XXXXXXXXX.");
  }

  if (action === "LIST_USERS") {
    const items = listUsers();
    if (!items.length) return showAdminMenu(ctx, "📋 Список продавців порожній.");

    const text =
      "📋 Список продавців:\n\n" +
      items
        .map((u, i) => {
          const fio = u.fio ? ` — ${u.fio}` : "";
          const tg = u.tg_id ? ` (tg_id: ${u.tg_id})` : "";
          return `${i + 1}) ${u.phone}${fio}${tg}`;
        })
        .join("\n");

    return showAdminMenu(ctx, text);
  }

  if (action === "ADD_ADMIN") {
    adminState.set(tgId, { mode: "ADD_ADMIN", step: "phone" });
    return ctx.reply("✅ Додати адміна\n\n1) Введіть номер у форматі +380XXXXXXXXX (можна з пробілами).");
  }

  if (action === "DEL_ADMIN") {
    adminState.set(tgId, { mode: "DEL_ADMIN", step: "phone" });
    return ctx.reply("⛔ Видалити адміна\n\nВведіть номер у форматі +380XXXXXXXXX.");
  }

  if (action === "LIST_ADMINS") {
    const items = listAdmins();
    if (!items.length) return showAdminMenu(ctx, "📋 Список адмінів порожній.");

    const text =
      "📋 Список адмінів:\n\n" +
      items
        .map((a, i) => {
          const fio = a.fio ? ` — ${a.fio}` : "";
          const tg = a.tg_id ? ` (tg_id: ${a.tg_id})` : "";
          return `${i + 1}) ${a.phone}${fio}${tg}`;
        })
        .join("\n");

    return showAdminMenu(ctx, text);
  }

  // Unknown action
  return showAdminMenu(ctx, "⚠️ Невідома адмін-дія.");
}

/**
 * Returns boolean:
 *  - true  => handled this message (stop further routing)
 *  - false => not handled (let other routers handle it)
 */
async function onAdminText(ctx) {
  const tgId = ctx.from?.id;
  if (!tgId) return false;

  const st = adminState.get(tgId);
  if (!st) return false;

  const text = String(ctx.message?.text || "").trim();

  // Step: phone
  if (st.step === "phone") {
    const phone = normalizePhone(text);
    if (!phone) {
      return ctx.reply("❌ Невірний номер. Спробуйте у форматі +380XXXXXXXXX.");
    }

    // DEL flows end on phone
    if (st.mode === "DEL_USER") {
      const ok = removeUserByPhone(phone);
      clearAdminState(ctx);
      return showAdminMenu(ctx, ok ? `✅ Продавця ${phone} видалено.` : `⚠️ Продавця ${phone} не знайдено.`);
    }

    if (st.mode === "DEL_ADMIN") {
      const ok = removeAdminByPhone(phone);
      clearAdminState(ctx);
      return showAdminMenu(ctx, ok ? `✅ Адміна ${phone} видалено.` : `⚠️ Адміна ${phone} не знайдено.`);
    }

    // ADD flows -> next step FIO
    adminState.set(tgId, { ...st, step: "fio", phone });
    return ctx.reply(`Номер прийнято: ${phone}\n\n2) Тепер введіть ПІБ (наприклад: Кушнір Володимир).`);
  }

  // Step: fio (only for ADD flows)
  if (st.step === "fio") {
    const fio = normalizeFio(text);
    if (!fio) {
      return ctx.reply("❌ Некоректне ПІБ. Введіть мінімум 2 слова (Прізвище Імʼя).");
    }

    const phone = st.phone;
    if (!phone) {
      clearAdminState(ctx);
      return showAdminMenu(ctx, "⚠️ Стан зіпсовано. Почніть ще раз.");
    }

    if (st.mode === "ADD_USER") {
      const existing = findUserByPhone(phone);
      if (existing) {
        // update fio if empty, keep tg_id if exists
        upsertUser({
          phone,
          fio: existing.fio ? existing.fio : fio,
          tg_id: existing.tg_id || null,
        });
        clearAdminState(ctx);
        return showAdminMenu(ctx, `✅ Продавець вже існував. Дані оновлено: ${phone} — ${existing.fio || fio}`);
      }

      upsertUser({ phone, fio, tg_id: null });
      clearAdminState(ctx);
      return showAdminMenu(ctx, `✅ Додано продавця: ${phone} — ${fio}`);
    }

    if (st.mode === "ADD_ADMIN") {
      const existing = findAdminByPhone(phone);
      if (existing) {
        upsertAdmin({
          phone,
          fio: existing.fio ? existing.fio : fio,
          tg_id: existing.tg_id || null,
        });
        clearAdminState(ctx);
        return showAdminMenu(ctx, `✅ Адмін вже існував. Дані оновлено: ${phone} — ${existing.fio || fio}`);
      }

      upsertAdmin({ phone, fio, tg_id: null });
      clearAdminState(ctx);
      return showAdminMenu(ctx, `👸 Додано адміна: ${phone} — ${fio}`);
    }

    clearAdminState(ctx);
    return showAdminMenu(ctx, "⚠️ Невідомий режим. Почніть ще раз.");
  }

  return false;
}

module.exports = {
  onAdminAction,
  onAdminText,
  clearAdminState,
};