// src/llm/referenceProfile.js
const { chatJSONSchema } = require("./client");

const SYSTEM = `
Ти парфюмер-консультант.
За НАЗВОЮ парфуму (reference) сформуй "профіль" для пошуку аналогів у магазині.
ВАЖЛИВО:
- Можеш опиратися на загальні знання про відомі аромати.
- Поверни тільки ключові ознаки: стать, сезон (якщо доречно), ноти/акорди, стиль/настрій.
- Пиши простими словами (українською), як це зберігають у базах ("зелений чай", "півонія").
- Якщо не впевнений — залиш поле null або порожній масив, але НЕ вигадуй екзотику.
`.trim();

const ProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["for_whom", "season", "notes", "style", "keywords"],
  properties: {
    for_whom: {
      anyOf: [
        { type: "string", enum: ["жіночий", "чоловічий", "унісекс"] },
        { type: "null" },
      ],
    },
    season: { anyOf: [{ type: "string" }, { type: "null" }] },
    notes: { type: "array", items: { type: "string" }, maxItems: 14 },
    style: { type: "array", items: { type: "string" }, maxItems: 12 },
    keywords: { type: "array", items: { type: "string" }, maxItems: 12 },
  },
};

function cleanArr(a, max = 12) {
  if (!Array.isArray(a)) return [];
  const out = [];
  for (const x of a) {
    const t = String(x || "").trim().toLowerCase();
    if (!t) continue;
    out.push(t);
  }
  return [...new Set(out)].slice(0, max);
}

async function referenceProfile(referenceName) {
  const obj = await chatJSONSchema(
    SYSTEM,
    `REFERENCE: ${String(referenceName || "").slice(0, 200)}`,
    { name: "profile", schema: ProfileSchema, temperature: 0.2 },
  );

  return {
    for_whom: obj.for_whom ?? null,
    season: obj.season ?? null,
    notes: cleanArr(obj.notes, 14),
    style: cleanArr(obj.style, 12),
    keywords: cleanArr(obj.keywords, 12),
  };
}

module.exports = { referenceProfile };