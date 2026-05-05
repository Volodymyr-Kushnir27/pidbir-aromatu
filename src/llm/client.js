const OpenAI = require("openai");
const { OPENAI_API_KEY, CHAT_MODEL } = require("../config");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function safeJsonParse(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {}
  }

  return null;
}

async function chatJSON({ system, user, temperature = 0.2 }) {
  const resp = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = resp.choices?.[0]?.message?.content || "{}";
  return safeJsonParse(content);
}

/**
 * Web-enabled JSON lookup через Responses API.
 *
 * В ENV можна задати:
 * OPENAI_WEB_MODEL=gpt-4.1-mini або gpt-5-mini
 * OPENAI_WEB_SEARCH_TOOL=web_search_preview або web_search
 *
 * Якщо tool name не підтримується у вашому акаунті/SDK,
 * функція пробує альтернативну назву.
 */
async function webJSON({ system, user, temperature = 0.15 }) {
  const model = process.env.OPENAI_WEB_MODEL || CHAT_MODEL || "gpt-4.1-mini";
  const preferredTool = process.env.OPENAI_WEB_SEARCH_TOOL || "web_search_preview";
  const fallbackTool = preferredTool === "web_search" ? "web_search_preview" : "web_search";

  const input = [
    {
      role: "system",
      content:
        `${system}\n\n` +
        "Return ONLY valid JSON. No markdown. No code fences. No explanations outside JSON.",
    },
    {
      role: "user",
      content: user,
    },
  ];

  async function runWithTool(toolType) {
    return openai.responses.create({
      model,
      temperature,
      tools: [{ type: toolType }],
      input,
    });
  }

  let resp;

  try {
    resp = await runWithTool(preferredTool);
  } catch (e1) {
    try {
      resp = await runWithTool(fallbackTool);
    } catch (e2) {
      console.error("webJSON responses error:", {
        preferredTool,
        fallbackTool,
        first: e1?.message || String(e1),
        second: e2?.message || String(e2),
      });
      return null;
    }
  }

  const text =
    resp?.output_text ||
    (Array.isArray(resp?.output)
      ? resp.output
          .flatMap((item) => item?.content || [])
          .map((part) => part?.text || part?.content || "")
          .join("\n")
      : "");

  return safeJsonParse(text);
}

module.exports = {
  openai,
  chatJSON,
  webJSON,
  safeJsonParse,
};
