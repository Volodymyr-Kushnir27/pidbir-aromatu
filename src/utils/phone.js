function normalizePhone(input) {
  if (!input) return null;

  // прибираємо все, крім цифр
  let digits = String(input).replace(/\D/g, "");

  // якщо починається з 0XXXXXXXXX -> робимо 380XXXXXXXXX
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = "38" + digits;
  }

  // якщо 80380... -> прибираємо 80 (інколи так вводять)
  if (digits.startsWith("80380")) {
    digits = digits.slice(2);
  }

  // очікуємо 12 цифр: 380XXXXXXXXX
  if (digits.length !== 12 || !digits.startsWith("380")) return null;

  return `+${digits}`;
}

module.exports = { normalizePhone };
