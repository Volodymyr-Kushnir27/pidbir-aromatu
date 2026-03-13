require("dotenv").config();
const Database = require("better-sqlite3");
const OpenAI = require("openai");

const DB_PATH =
  process.env.CATALOG_DB_PATH ||
  process.env.DB_PATH ||
  "/var/data/perfumes.sqlite";
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const db = new Database(DB_PATH);

// 1) Текст для embeddings: робимо максимально стабільний “паспорт аромату”
function buildEmbeddingText(p) {
  return [
    p.number_code ? `code: ${p.number_code}` : null,
    p.name ? `name: ${p.name}` : null,
    p.for_whom ? `for_whom: ${p.for_whom}` : null,
    p.type ? `type: ${p.type}` : null,
    p.season ? `season: ${p.season}` : null,
    p.occasion ? `occasion: ${p.occasion}` : null,
    p.age ? `age: ${p.age}` : null,
    p.notes ? `notes: ${p.notes}` : null,
    p.keywords ? `keywords: ${p.keywords}` : null,
    p.description ? `description: ${p.description}` : null,
  ].filter(Boolean).join("\n");
}

// 2) Отримання embedding
async function embed(text) {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: String(text || "").slice(0, 12000),
  });
  return res.data[0].embedding;
}

const perfumes = db.prepare(`
  SELECT id, number_code, name, for_whom, type, season, occasion, age, notes, keywords, description
  FROM perfumes
`).all();

const existsStmt = db.prepare(`
  SELECT 1 FROM perfume_embeddings WHERE perfume_id = ? AND model = ? LIMIT 1
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO perfume_embeddings (perfume_id, model, embedding_json)
  VALUES (?, ?, ?)
`);

(async () => {
  console.log("DB:", DB_PATH);
  console.log("Perfumes:", perfumes.length);
  console.log("Embed model:", EMBED_MODEL);

  let done = 0;
  let skipped = 0;

  for (let i = 0; i < perfumes.length; i++) {
    const p = perfumes[i];

    if (existsStmt.get(p.id, EMBED_MODEL)) {
      skipped++;
      continue;
    }

    const text = buildEmbeddingText(p);
    const vec = await embed(text);

    insertStmt.run(p.id, EMBED_MODEL, JSON.stringify(vec));
    done++;

    if ((i + 1) % 10 === 0) {
      console.log(`progress: ${i + 1}/${perfumes.length} (embedded=${done}, skipped=${skipped})`);
    }
  }

  console.log(`✅ DONE: embedded=${done}, skipped=${skipped}`);
  db.close();
})().catch((e) => {
  console.error("❌ ERROR:", e);
  db.close();
  process.exit(1);
});
