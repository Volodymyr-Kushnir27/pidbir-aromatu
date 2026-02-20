const { chatJSON } = require("./client");

const SYSTEM = `
Ти професійний парфюмер-консультант. Твоє завдання: розібрати текст запиту користувача дізнатись який парфум він хоче з чого цей парфум складається його ноти та повернути ТІЛЬКИ JSON.
Не вигадуй бренди або назви ароматів.
Поля:
- for_whom: "male" | "female" | "unisex" | null
- season: string|null (наприклад "літо", "зима", "весна", "осінь")
- occasion: string|null (наприклад "офіс", "побачення", "вечір", "спорт")
- reference: string|null (якщо користувач назвав конкретний аромат)
- desired_notes: array of strings
- avoid_notes: array of strings
- style: array of strings (наприклад "свіжий", "солодкий", "деревний", "цитрусовий")
`.trim();

async function parseQuery(userText) {
  const raw = await chatJSON(SYSTEM, userText);
  try {
    const obj = JSON.parse(raw);
    return {
      for_whom: obj.for_whom ?? null,
      season: obj.season ?? null,
      occasion: obj.occasion ?? null,
      reference: obj.reference ?? null,
      desired_notes: Array.isArray(obj.desired_notes) ? obj.desired_notes : [],
      avoid_notes: Array.isArray(obj.avoid_notes) ? obj.avoid_notes : [],
      style: Array.isArray(obj.style) ? obj.style : [],
    };
  } catch {
    // fallback: якщо LLM повернув щось криве
    return {
      for_whom: null, season: null, occasion: null, reference: null,
      desired_notes: [], avoid_notes: [], style: []
    };
  }
}

module.exports = { parseQuery };
