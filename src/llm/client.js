const OpenAI = require("openai");
const { OPENAI_API_KEY, CHAT_MODEL } = require("../config");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

module.exports = {
  openai,
  chatJSON,
};