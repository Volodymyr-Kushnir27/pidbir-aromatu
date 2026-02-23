// src/llm/parseQuery.js
const { chatJSONSchema } = require("./client");

const SYSTEM = `
Ти професійний парфюмер-консультант і ПАРСЕР запитів.
Твоя задача — витягнути структуру запиту користувача для пошуку по базі парфумів.
ВАЖЛИВО:
- Не вигадуй бренди/назви/ноти яких немає у тексті користувача.
- Якщо користувач назвав конкретний аромат — заповни поле reference.
- Якщо запит типу "знайди схоже на X" / "аналоги X" — reference теж має бути X.
- Поверни рівно JSON за схемою.
`.trim();

const QuerySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "for_whom",
    "season",
    "occasion",
    "reference",
    "desired_notes",
    "avoid_notes",
    "style",
  ],
  properties: {
    for_whom: {
      anyOf: [
        { type: "string", enum: ["male", "female", "unisex"] },
        { type: "null" },
      ],
    },
    season: { anyOf: [{ type: "string" }, { type: "null" }] },
    occasion: { anyOf: [{ type: "string" }, { type: "null" }] },
    reference: { anyOf: [{ type: "string" }, { type: "null" }] },
    desired_notes: { type: "array", items: { type: "string" }, maxItems: 12 },
    avoid_notes: { type: "array", items: { type: "string" }, maxItems: 12 },
    style: { type: "array", items: { type: "string" }, maxItems: 12 },
  },
};

function cleanArr(a) {
  if (!Array.isArray(a)) return [];
  const out = [];
  for (const x of a) {
    const t = String(x || "").trim();
    if (!t) continue;
    out.push(t);
  }
  return [...new Set(out)].slice(0, 12);
}

async function parseQuery(userText) {
  const obj = await chatJSONSchema(SYSTEM, String(userText || ""), {
    name: "query",
    schema: QuerySchema,
    temperature: 0.1,
  });

  return {
    for_whom: obj.for_whom ?? null,
    season: obj.season ?? null,
    occasion: obj.occasion ?? null,
    reference: obj.reference ?? null,
    desired_notes: cleanArr(obj.desired_notes),
    avoid_notes: cleanArr(obj.avoid_notes),
    style: cleanArr(obj.style),
  };
}

module.exports = { parseQuery };