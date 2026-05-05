require("dotenv").config();

const db = require("../src/db/catalogDb");
const { rebuildPerfumesFts, hasPerfumesFts } = require("../src/search/catalogRepo");

console.log("🔎 Rebuilding perfumes_fts...");
console.log("FTS exists before:", hasPerfumesFts());

const startedAt = Date.now();

try {
  const result = rebuildPerfumesFts();

  console.log("✅ perfumes_fts rebuilt");
  console.log("perfumes rows:", result.perfumesCount);
  console.log("fts rows:", result.ftsCount);
  console.log("time:", `${Date.now() - startedAt} ms`);

  const sample = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM perfumes_fts
      WHERE perfumes_fts MATCH 'creed* OR крид* OR lacoste* OR лакост* OR gaba* OR габа* OR girl*'
      `,
    )
    .get();

  console.log("sample search rows:", sample?.count || 0);
  process.exit(0);
} catch (e) {
  console.error("❌ Failed to rebuild perfumes_fts");
  console.error(e);
  process.exit(1);
}
