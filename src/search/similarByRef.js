// src/search/similarByRef.js
const db = require("../db/catalogDb");
const { EMBED_MODEL } = require("../config");

/* =========================
   Helpers
========================= */
function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function cosineSim(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tableExists(name) {
  try {
    const r = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
      .get(name);
    return !!r;
  } catch {
    return false;
  }
}

/* =========================
   Adaptive select for perfumes
========================= */
let _perfumeColsCache = null;

function getPerfumeColumns() {
  if (_perfumeColsCache) return _perfumeColsCache;
  try {
    const rows = db.prepare(`PRAGMA table_info('perfumes')`).all();
    _perfumeColsCache = new Set(rows.map((r) => String(r.name)));
  } catch {
    _perfumeColsCache = new Set();
  }
  return _perfumeColsCache;
}

const PERFUME_FIELDS = [
  "id",
  "photo",
  "number_code",
  "name",
  "premiere",
  "type",
  "for_whom",
  "season",
  "occasion",
  "age",
  "notes",
  "keywords",
  "version",
  "description",
  "projection",
  "komu",
];

function selectFieldOrNull(field, cols) {
  return cols.has(field) ? field : `NULL AS ${field}`;
}

function perfumeSelectSQL() {
  const cols = getPerfumeColumns();
  const selectList = PERFUME_FIELDS.map((f) => selectFieldOrNull(f, cols)).join(
    ",\n      ",
  );
  return `
    SELECT
      ${selectList}
    FROM perfumes
  `;
}

/* =========================
   Embeddings access
========================= */
function getEmbedding(perfumeId) {
  const row = db
    .prepare(
      `
    SELECT embedding_json
    FROM perfume_embeddings
    WHERE perfume_id = ? AND model = ?
    LIMIT 1
  `,
    )
    .get(perfumeId, EMBED_MODEL);

  const vec = row ? safeJsonParse(row.embedding_json) : null;
  return Array.isArray(vec) ? vec : null;
}

function getAllEmbeddings() {
  return db
    .prepare(
      `
    SELECT perfume_id, embedding_json
    FROM perfume_embeddings
    WHERE model = ?
  `,
    )
    .all(EMBED_MODEL);
}

function getPerfumesByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db
    .prepare(
      `
    ${perfumeSelectSQL()}
    WHERE id IN (${placeholders})
  `,
    )
    .all(...ids);
}

function similarPerfumes(perfumeId, limit = 3) {
  if (!tableExists("perfume_embeddings")) {
    return { ok: false, reason: "no_embeddings_table", items: [] };
  }

  const refVec = getEmbedding(perfumeId);
  if (!refVec) return { ok: false, reason: "no_embedding_for_ref", items: [] };

  const all = getAllEmbeddings();
  const scored = [];

  for (const row of all) {
    const id = Number(row.perfume_id);
    if (id === Number(perfumeId)) continue;

    const v = safeJsonParse(row.embedding_json);
    if (!Array.isArray(v)) continue;

    scored.push({ id, score: cosineSim(refVec, v) });
  }

  scored.sort((a, b) => b.score - a.score);
  const topIds = scored.slice(0, limit).map((x) => x.id);

  const items = getPerfumesByIds(topIds);
  const byId = new Map(items.map((x) => [x.id, x]));
  return { ok: true, items: topIds.map((id) => byId.get(id)).filter(Boolean) };
}

module.exports = { similarPerfumes };