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
    await ctx.reply("❌ Не вдалося проаналізувати запит.");
    return true;
  }

  const hasSearchData =
    analysis?.query_type === "reference_perfume" ||
    analysis?.query_type === "note_search" ||
    analysis?.query_type === "style_search" ||
    (analysis?.search_terms && analysis.search_terms.length) ||
    (analysis?.notes_top && analysis.notes_top.length) ||
    (analysis?.notes_heart && analysis.notes_heart.length) ||
    (analysis?.notes_base && analysis.notes_base.length) ||
    (analysis?.style && analysis.style.length) ||
    (analysis?.accords && analysis.accords.length);

  if (!hasSearchData) {
    await ctx.reply(
      analysis?.user_friendly_reply ||
        "Не до кінця зрозумів, що саме Ви шукаєте. Напишіть або назву аромату, або бажані ноти чи стиль.",
    );
    return true;
  }

  if (analysis.user_friendly_reply) {
    await ctx.reply(analysis.user_friendly_reply);
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
      "У базі поки не знайшов вдалих збігів. Можете уточнити: для кого аромат, який стиль або які ноти цікаві?"
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