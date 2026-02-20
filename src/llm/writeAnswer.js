const { chatText } = require("./client");

function buildItemsText(items) {
  return items.map((p, i) => {
    const lines = [
      `${i + 1}) ${p.brand ? p.brand + " " : ""}${p.name}`,
      p.for_whom ? `for_whom: ${p.for_whom}` : null,
      p.season ? `season: ${p.season}` : null,
      p.occasion ? `occasion: ${p.occasion}` : null,
      p.notes ? `notes: ${p.notes}` : null,
      p.keywords ? `keywords: ${p.keywords}` : null,
      p.description ? `description: ${p.description}` : null
    ].filter(Boolean);
    return lines.join("\n");
  }).join("\n\n");
}

const SYSTEM = `
Ти парфюмер-консультант.
ВАЖЛИВО: Ти маєш право рекомендувати ТІЛЬКИ аромати з "CATALOG ITEMS".
НЕ вигадуй назв, брендів, нот, яких немає в items.
Формат відповіді:
- коротко 1-2 речення про інтенцію клієнта
- 3-5 рекомендацій списком (назва + чому підійшло)
- 1 рядок: "Якщо хочеш — уточни: сезон/стійкість/бюджет/що не подобається"
`.trim();

async function writeAnswer(userText, parsed, items) {
  const catalog = buildItemsText(items);
  const prompt = `
USER REQUEST:
${userText}

PARSED INTENT (JSON):
${JSON.stringify(parsed, null, 2)}

CATALOG ITEMS (choose ONLY from this list):
${catalog}
  `.trim();

  return chatText(SYSTEM, prompt);
}

module.exports = { writeAnswer };
