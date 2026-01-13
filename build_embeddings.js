require("dotenv").config();
const OpenAI = require("openai");
const Database = require("better-sqlite3");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = new Database(process.env.DB_PATH);

const MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const BATCH_SIZE = 64;

function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makePerfumeText(p) {
  return [
    `Назва: ${p.name}`,
    `Категорії: ${stripHtml(p.categories)}`,
    `Короткий опис: ${stripHtml(p.short_desc)}`,
    `Опис: ${stripHtml(p.description)}`
  ].filter(Boolean).join("\n");
}

async function embedBatch(texts) {
  const resp = await openai.embeddings.create({
    model: MODEL,
    input: texts,
    encoding_format: "float"
  });
  return resp.data.map(d => d.embedding);
}

async function main() {
  const perfumes = db.prepare(`
    SELECT id, name, categories, short_desc, description
    FROM perfumes
    WHERE type='variable'
      AND (
        (description IS NOT NULL AND TRIM(description) != '')
        OR (short_desc IS NOT NULL AND TRIM(short_desc) != '')
      )
  `).all();

  console.log(`Perfumes to embed: ${perfumes.length}`);

  const upsert = db.prepare(`
    INSERT INTO perfume_embeddings (perfume_id, model, embedding_json, updated_at)
    VALUES (@perfume_id, @model, @embedding_json, @updated_at)
    ON CONFLICT(perfume_id) DO UPDATE SET
      model=excluded.model,
      embedding_json=excluded.embedding_json,
      updated_at=excluded.updated_at
  `);

  for (let i = 0; i < perfumes.length; i += BATCH_SIZE) {
    const chunk = perfumes.slice(i, i + BATCH_SIZE);
    const texts = chunk.map(makePerfumeText);
    const embeddings = await embedBatch(texts);

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      for (let j = 0; j < chunk.length; j++) {
        upsert.run({
          perfume_id: chunk[j].id,
          model: MODEL,
          embedding_json: JSON.stringify(embeddings[j]),
          updated_at: now
        });
      }
    });
    tx();

    console.log(`Embedded ${Math.min(i + BATCH_SIZE, perfumes.length)}/${perfumes.length}`);
  }

  const count = db.prepare(`SELECT COUNT(*) AS c FROM perfume_embeddings`).get().c;
  console.log(`✅ Done. Stored embeddings: ${count}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

