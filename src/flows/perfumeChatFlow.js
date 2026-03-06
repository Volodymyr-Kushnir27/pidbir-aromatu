const { Markup } = require("telegraf");
const { SEARCH } = require("../config");
const { PICK_MODE_HELP } = require("../ui/messages");
const { analyzePerfumeIntent } = require("../llm/perfumeAnalyzer");
const { buildSearchProfile } = require("../llm/perfumeSearchProfile");
const { attachReasons } = require("../llm/resultExplainer");
const { findCandidates } = require("../search/candidateSearch");
const { rerankTopK } = require("../search/candidateRerank");
const { sendPerfumeCard } = require("./sendPerfumeCard");

const modeState = new Map();
// tgId -> { mode: "pick" }

function getTgId(ctx) {
  return ctx.from?.id;
}

function setMode(ctx, mode) {
  const tgId = getTgId(ctx);
  if (!tgId) return;
  modeState.set(tgId, { mode });
}

function getMode(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return null;
  return modeState.get(tgId)?.mode || null;
}

function disableMode(ctx) {
  const tgId = getTgId(ctx);
  if (!tgId) return;
  modeState.delete(tgId);
}

async function onUserPickAction(ctx) {
  setMode(ctx, "pick");

  return ctx.reply(
    PICK_MODE_HELP,
    Markup.inlineKeyboard([
      [Markup.button.callback("⬅️ Назад", "BACK_HOME")],
      [Markup.button.callback("❌ Вийти", "EXIT_PICK")],
    ]),
  );
}

async function onUserText(ctx) {
  const mode = getMode(ctx);
  if (mode !== "pick") return false;

  const text = String(ctx.message?.text || "").trim();
  if (!text) return true;

  await ctx.reply("🔎 Аналізую аромат...");

  let analysis;
  try {
    analysis = await analyzePerfumeIntent(text);
  } catch (e) {
    console.error("analyzePerfumeIntent error:", e);
    await ctx.reply("❌ Не вдалося проаналізувати аромат.");
    return true;
  }

  if (!analysis?.found) {
    await ctx.reply(
      analysis?.short_ai_text ||
        "Не зміг зрозуміти, який саме аромат Ви маєте на увазі. Напишіть точнішу назву.",
    );
    return true;
  }

  if (analysis.short_ai_text) {
    await ctx.reply(analysis.short_ai_text);
  }

  let searchProfile;
  try {
    searchProfile = await buildSearchProfile(analysis);
  } catch (e) {
    console.error("buildSearchProfile error:", e);
    await ctx.reply("❌ Не вдалося побудувати профіль пошуку.");
    return true;
  }

  let candidates = [];
  try {
    candidates = findCandidates(searchProfile, SEARCH.LIMIT_CANDIDATES || 80);
  } catch (e) {
    console.error("findCandidates error:", e);
    await ctx.reply("❌ Помилка пошуку в базі.");
    return true;
  }

  if (!candidates.length) {
    await ctx.reply(
      "❌ У базі не знайшов достатньо схожих варіантів. Спробуйте іншу назву або ширший запит.",
    );
    return true;
  }

  let top = rerankTopK(
    candidates,
    searchProfile,
    analysis.target_name,
    SEARCH.TOP_K || 3,
  );

  top = attachReasons(top, searchProfile);

  if (!top.length) {
    await ctx.reply("❌ Схожих варіантів не знайшов.");
    return true;
  }

  await ctx.reply(`✨ Підібрав ${top.length} найбільш схожі варіанти:`);

  for (const item of top) {
    const why = Array.isArray(item.why_selected) ? item.why_selected : [];
    const reasonBlock = why.length
      ? `\n\nЧому обрано:\n• ${why.join("\n• ")}`
      : "";

    const payload = {
      ...item,
      short_desc: `${item.short_desc || ""}${reasonBlock}`.trim(),
    };

    await sendPerfumeCard(ctx, payload, {
      notes: false,
      season: false,
    });
  }

  return true;
}

module.exports = {
  onUserPickAction,
  onUserText,
  disableMode,
};