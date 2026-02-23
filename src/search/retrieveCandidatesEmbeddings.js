// src/search/retrieveCandidatesEmbeddings.js
const db = require("../db/catalogDb");
const { openai } = require("../llm/client");
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

async function embedText(text) {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: String(text || "").slice(0, 12000),
  });
  return res.data[0].embedding;
}

/* =========================
   Adaptive select for perfumes alias "p"
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
  "description",
  "projection",
  "version",
  "komu",
];

function selectFieldOrNull(alias, field, cols) {
  return cols.has(field) ? `${alias}.${field} AS ${field}` : `NULL AS ${field}`;
}

function perfumeSelectList(alias = "p") {
  const cols = getPerfumeColumns();
  return PERFUME_FIELDS.map((f) => selectFieldOrNull(alias, f, cols)).join(
    ",\n      ",
  );
}

/* =========================
   Load candidates
========================= */
function loadCandidatesFromDb({ forWhomLike, seasonLike, occasionLike } = {}) {
  const sql = `
    SELECT
      ${perfumeSelectList("p")},
      e.embedding_json
    FROM perfume_embeddings e
    JOIN perfumes p ON p.id = e.perfume_id
    WHERE e.model = ?
      ${forWhomLike ? "AND COALESCE(p.for_whom,'') LIKE ?" : ""}
      ${seasonLike ? "AND COALESCE(p.season,'') LIKE ?" : ""}
      ${occasionLike ? "AND COALESCE(p.occasion,'') LIKE ?" : ""}
  `;

  const params = [EMBED_MODEL];
  if (forWhomLike) params.push(`%${forWhomLike}%`);
  if (seasonLike) params.push(`%${seasonLike}%`);
  if (occasionLike) params.push(`%${occasionLike}%`);

  return db.prepare(sql).all(...params);
}

function rankByVector(queryVec, rows, limit) {
  const scored = [];
  for (const r of rows) {
    const vec = safeJsonParse(r.embedding_json);
    if (!Array.isArray(vec)) continue;
    const score = cosineSim(queryVec, vec);
    scored.push({ ...r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

async function retrieveCandidatesEmbeddings({
  queryText,
  queryVec = null,
  limit = 8,
  filters = {},
}) {
  const rows = loadCandidatesFromDb(filters);
  const vec = queryVec || (await embedText(queryText));
  return rankByVector(vec, rows, limit);
}

module.exports = { retrieveCandidatesEmbeddings };