// src/llm/client.js
const OpenAI = require("openai");
const { OPENAI_API_KEY, CHAT_MODEL } = require("../config");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Responses API:
 * text.format: { type: "json_schema", strict: true, name, schema }
 * res.output_text -> string (JSON)
 */
async function chatJSONSchema(
  instructions,
  input,
  { name = "data", schema, temperature = 0.1 } = {},
) {
  if (!schema) throw new Error("chatJSONSchema: schema is required");

  const res = await openai.responses.create({
    model: CHAT_MODEL,
    instructions,
    input: String(input ?? "").slice(0, 12000),
    temperature,
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  });

  const txt = res.output_text || "";
  const obj = safeJsonParse(txt);
  if (!obj) throw new Error("chatJSONSchema: model returned non-JSON output");
  return obj;
}

/**
 * Старий JSON-mode (інколи зручний), але без schema strict.
 */
async function chatJSONObject(instructions, input, { temperature = 0.2 } = {}) {
  const res = await openai.responses.create({
    model: CHAT_MODEL,
    instructions,
    input: String(input ?? "").slice(0, 12000),
    temperature,
    text: { format: { type: "json_object" } },
  });

  const txt = res.output_text || "";
  const obj = safeJsonParse(txt);
  if (!obj) throw new Error("chatJSONObject: model returned non-JSON output");
  return obj;
}

async function chatText(instructions, input, { temperature = 0.6 } = {}) {
  const res = await openai.responses.create({
    model: CHAT_MODEL,
    instructions,
    input: String(input ?? "").slice(0, 12000),
    temperature,
  });

  return res.output_text || "";
}

module.exports = { openai, chatJSONSchema, chatJSONObject, chatText };