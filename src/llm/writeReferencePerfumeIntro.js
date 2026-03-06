const { chatJSON } = require("./client");

async function writeReferencePerfumeIntro({ userText, analysis }) {
  const system = `
Ти досвідчений парфумерний консультант.

Твоє завдання:
на основі вже розпізнаного аромату написати красивий вступний текст українською для Telegram.

Поверни JSON у форматі:

{
  "intro_text": ""
}

Вимоги до intro_text:
- Це має бути готовий текст для користувача.
- Пиши природно, як ChatGPT-консультант.
- Не пиши сухо.
- Не пиши канцеляритом.
- Можна використовувати емодзі: 🧴 🌿 👤 🍂 ✨
- Якщо є достатньо даних, текст має містити:
  1. що це за аромат
  2. його характер
  3. основні ноти:
     - верхні
     - серце
     - база
  4. для кого
  5. сезон / коли найкраще звучить
  6. короткий підсумок
- Якщо деяких даних бракує, не вигадуй зайвого — просто пиши м’якше і загальніше.
- Не використовуй JSON у тексті.
- Не додавай фразу "зараз підберу" більше одного разу.
- Форматуй так, щоб це було зручно читати в Telegram.
`;

  const user = JSON.stringify(
    {
      userText,
      analysis,
    },
    null,
    2,
  );

  const json = await chatJSON({
    system,
    user,
    temperature: 0.45,
  });

  return String(json?.intro_text || "").trim();
}

module.exports = { writeReferencePerfumeIntro };