// src/utils/phone.js
function normalizePhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // лишаємо тільки цифри
  let digits = raw.replace(/\D+/g, "");

  // Telegram інколи дає без '+', просто 380...
  // 1) 0XXXXXXXXX -> 380XXXXXXXXX
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = "38" + digits;
  }

  // 2) 80XXXXXXXXX -> 380XXXXXXXXX (рідко, але буває)
  if (digits.length === 11 && digits.startsWith("80")) {
    digits = "3" + digits;
  }

  // 3) якщо вже 380XXXXXXXXX
  if (digits.length === 12 && digits.startsWith("380")) {
    return "+" + digits;
  }

  // 4) якщо прийшло з '+', ми його прибрали, тому це теж 12 цифр
  // інші формати не приймаємо
  return null;
}

module.exports = { normalizePhone };