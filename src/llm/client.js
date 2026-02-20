const OpenAI = require("openai");
const { OPENAI_API_KEY, CHAT_MODEL } = require("../config");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function chatJSON(system, user) {
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });
  return res.choices[0].message.content;
}

async function chatText(system, user) {
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.6,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });
  return res.choices[0].message.content;
}

module.exports = { openai, chatJSON, chatText };
