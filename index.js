require("dotenv").config();
const { Telegraf } = require("telegraf");
const Database = require("better-sqlite3");

const bot = new Telegraf(process.env.BOT_TOKEN);
const db = new Database(process.env.DB_PATH, { readonly: true });

// Пошук тільки по "variable" ароматах
const searchStmt = db.prepare(`
  SELECT id, name, image_url
  FROM perfumes
  WHERE type = 'variable'
    AND (
      name LIKE '%' || ? || '%'
      OR categories LIKE '%' || ? || '%'
      OR short_desc LIKE '%' || ? || '%'
      OR description LIKE '%' || ? || '%'
    )
  LIMIT 5
`);

bot.start((ctx) => {
  ctx.reply(
    "👃 Напиши бренд, ноти або асоціації.\n" +
    "Наприклад: ваніль, квіткові, солодкий, нішеві."
  );
});

bot.on("text", async (ctx) => {
  const q = ctx.message.text.trim();

  const rows = searchStmt.all(q, q, q, q);

  if (!rows.length) {
    return ctx.reply("❌ Нічого не знайшов. Спробуй інші слова.");
  }

  for (const p of rows) {
    if (p.image_url) {
      await ctx.replyWithPhoto(p.image_url, { caption: p.name });
    } else {
      await ctx.reply(p.name);
    }
  }
});

bot.launch();
console.log("✅ Bot started");
