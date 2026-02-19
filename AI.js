// AI.js
// Розумний пошук: (1) code-lookup по NAME (100%) + (2) embeddings candidates + GPT rerank "як продавець"

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function normalizeCodeToken(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/№/g, "")
    .trim();
}

// Витягує “коди” з NAME, включно з "154A/6E"
function extractCodeTokensFromName(name) {
  const t = normalizeCodeToken(stripHtml(name));
  if (!t) return [];

  const tokens = new Set();

  const comboRe = /\b([0-9]{1,4}[A-ZА-Я]?)\s*[/\-]\s*([0-9]{1,4}[A-ZА-Я]?)\b/g;
  let m;
  while ((m = comboRe.exec(t)) !== null) {
    const a = normalizeCodeToken(m[1]);
    const b = normalizeCodeToken(m[2]);
    if (a) tokens.add(a);
    if (b) tokens.add(b);
    tokens.add(`${a}/${b}`);
  }

  const singleRe = /\b([0-9]{1,4}[A-ZА-Я]?)\b/g;
  while ((m = singleRe.exec(t)) !== null) {
    const x = normalizeCodeToken(m[1]);
    if (x) tokens.add(x);
  }

  return [...tokens];
}

function looksLikeCodeQuery(q) {
  const s = normalizeCodeToken(q);
  if (!s) return false;

  if (/^[0-9]{1,4}$/.test(s)) return true;
  if (/^[0-9]{1,4}[A-ZА-Я]$/.test(s)) return true;
  if (/^[0-9]{1,4}[A-ZА-Я]?\/[0-9]{1,4}[A-ZА-Я]?$/.test(s)) return true;
  if (/^[0-9]{1,3}[A-ZА-Я]{1}$/.test(s)) return true;

  return false;
}

function buildCodeIndex(perfumes) {
  for (const p of perfumes) {
    p.__codeTokens = extractCodeTokensFromName(p.name || "");
  }
  return perfumes;
}

// 100% code lookup по NAME tokens
function findByCodeInName(allPerfumes, rawQuery) {
  const q = normalizeCodeToken(rawQuery);
  if (!q) return [];

  const isDigitsOnly = /^[0-9]{1,4}$/.test(q);
  const qNum = isDigitsOnly ? Number(q) : null;

  const matches = [];

  for (const p of allPerfumes) {
    const name = stripHtml(p.name || "");
    if (!name) continue;

    const tokens = p.__codeTokens || [];
    if (!tokens.length) continue;

    let score = 0;

    if (q.includes("/")) {
      const parts = q.split("/").map(normalizeCodeToken).filter(Boolean);
      const hasAllParts = parts.every((pt) => tokens.includes(pt));
      if (tokens.includes(q) || hasAllParts) score = 100;
    } else {
      if (!isDigitsOnly && tokens.includes(q)) score = 100;

      if (isDigitsOnly) {
        for (const t of tokens) {
          const mm = t.match(/^([0-9]{1,4})([A-ZА-Я]?)$/);
          if (!mm) continue;
          const n = Number(mm[1]);
          if (Number.isFinite(n) && n === qNum) score = Math.max(score, 95);
        }

        const nameNorm = normalizeCodeToken(name);
        if (nameNorm.startsWith(q)) score = Math.max(score, 90);
      }
    }

    if (score > 0) matches.push({ p, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.map((x) => x.p);
}

async function embedText(openai, model, text) {
  const r = await openai.embeddings.create({
    model,
    input: text,
    encoding_format: "float",
  });
  return r.data[0].embedding;
}

// Embeddings candidates (top-N)
async function semanticCandidates({
  openai,
  embedModel,
  query,
  embeddings,   // [{ perfume_id, embedding }]
  perfumesById, // Map
  limitHard = 60,
}) {
  if (!embeddings || embeddings.length === 0) return [];
  const qEmb = await embedText(openai, embedModel, query);

  const scored = embeddings
    .map((e) => ({ id: e.perfume_id, score: cosineSim(qEmb, e.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limitHard);

  return scored
    .map((x) => ({ ...x, p: perfumesById.get(x.id) }))
    .filter((x) => x.p);
}

// ===== GPT RERANK (seller-like) =====

// Robust JSON extraction (handles ```json ...```)
function safeExtractJson(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  // remove code fences
  const unfenced = t
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  // try find first [ ... ] or { ... }
  const arrMatch = unfenced.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];

  const objMatch = unfenced.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];

  return null;
}

async function gptSelectTopIds({
  openai,
  chatModel,
  userQuery,
  candidates, // array of perfumes (objects)
  maxPick = 3,
}) {
  if (!candidates?.length) return [];

  // Щоб не з’їдати токени: даємо 25–35 кандидатів максимум
  const slice = candidates.slice(0, 30);

  const items = slice.map((p) => ({
    id: p.id,
    name: stripHtml(p.name || ""),
    for_whom: stripHtml(p.for_whom || p.komu || ""),
    type: stripHtml(p.type || ""),
    season: stripHtml(p.season || ""),
    occasion: stripHtml(p.occasion || ""),
    age: stripHtml(p.age || ""),
    notes: stripHtml(p.notes || "").slice(0, 260),
    description: stripHtml(p.description || "").slice(0, 260),
    keywords: stripHtml(p.keywords || "").slice(0, 160),
  }));

  const prompt = `
Ти досвідчений продавець-консультант з парфумерії.
Обери з кандидатів ТІЛЬКИ ті аромати, що реально відповідають запиту користувача.

Правила:
- Не вигадуй фактів — використовуй тільки поля кандидата.
- Якщо запит про стать/сезон/стиль — відкидай те, що не підходить.
- Якщо є явні суперечності (користувач просить "несолодкий", а опис/keywords явно про "солодкий") — не бери.
- Відповідь: ТІЛЬКИ валідний JSON-масив id, без пояснень, без markdown.
- Кількість: 1..${maxPick}. Якщо підходить 1 — поверни 1. Якщо 2 — 2. Якщо 3+ — поверни 3.
- Якщо немає жодного, поверни [].

Запит користувача: """${userQuery}"""

Кандидати (JSON):
${JSON.stringify(items, null, 2)}
`.trim();

  try {
    const resp = await openai.chat.completions.create({
      model: chatModel,
      messages: [
        { role: "system", content: "Return ONLY valid JSON array of ids. No markdown. No text." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    });

    const raw = resp.choices?.[0]?.message?.content || "";
    const jsonStr = safeExtractJson(raw) || raw;

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    // sanitize: only ids from candidates
    const allowed = new Set(slice.map((p) => p.id));
    const out = [];
    for (const x of parsed) {
      const id = Number(x);
      if (Number.isFinite(id) && allowed.has(id) && !out.includes(id)) out.push(id);
      if (out.length >= maxPick) break;
    }
    return out;
  } catch (e) {
    console.error("gptSelectTopIds error:", e?.message || e);
    return [];
  }
}

function genderBucket(p) {
  const t = `${p.for_whom || ""} ${p.komu || ""}`.toLowerCase();
  if (t.includes("унісекс") || t.includes("unisex")) return "unisex";
  if (t.includes("чолов") || t.includes("муж") || t.includes("men") || t.includes("homme")) return "male";
  if (t.includes("жіноч") || t.includes("жен") || t.includes("women") || t.includes("femme")) return "female";
  return "unknown";
}

// для "Схоже": попередньо відфільтруємо кандидатів за статтю (щоб не мішало жіночі/чоловічі)
function prefilterSimilarCandidates(basePerfume, scoredCandidates) {
  const baseG = genderBucket(basePerfume);
  if (baseG === "unknown") return scoredCandidates;

  const filtered = scoredCandidates.filter((x) => genderBucket(x.p) === baseG || genderBucket(x.p) === "unisex");
  return filtered.length ? filtered : scoredCandidates;
}

module.exports = {
  stripHtml,
  normalizeCodeToken,
  looksLikeCodeQuery,
  buildCodeIndex,
  findByCodeInName,
  semanticCandidates,
  gptSelectTopIds,
  cosineSim,
  extractCodeTokensFromName,
  genderBucket,
  prefilterSimilarCandidates,
};
