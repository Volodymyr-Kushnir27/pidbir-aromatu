const { chatJSON } = require("./client");

async function buildSearchProfile(analysis) {
  const system = `
Ти будуєш search-profile для SQLite бази парфумів.

Поверни JSON у форматі:

{
  "gender": "male|female|unisex|unknown",
  "season": ["spring","summer","autumn","winter"],
  "notes_include": [],
  "notes_prefer": [],
  "accords": [],
  "style_tags": [],
  "exclude_tags": [],
  "weights": {
    "fresh": 0,
    "sweet": 0,
    "woody": 0,
    "aquatic": 0,
    "citrus": 0,
    "spicy": 0,
    "powdery": 0,
    "green": 0
  }
}

Правила:
- Значення 0..5
- notes_include = найважливіші ноти
- notes_prefer = другорядні ноти
- accords/style_tags = узагальнення під пошук
- Якщо дані невідомі — став порожні масиви або 0
`;

  const user = `Ось perfume analysis:\n${JSON.stringify(analysis, null, 2)}`;

  const json = await chatJSON({
    system,
    user,
    temperature: 0.1,
  });

  return (
    json || {
      gender: "unknown",
      season: [],
      notes_include: [],
      notes_prefer: [],
      accords: [],
      style_tags: [],
      exclude_tags: [],
      weights: {
        fresh: 0,
        sweet: 0,
        woody: 0,
        aquatic: 0,
        citrus: 0,
        spicy: 0,
        powdery: 0,
        green: 0,
      },
    }
  );
}

module.exports = { buildSearchProfile };