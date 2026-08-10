const { Markup } = require("telegraf");
const { buildUserContext } = require("../lib/context");
const { generateIdeas } = require("../lib/ai/ideaGenerator");
const { sendLong } = require("../lib/telegram");
const state = require("./state");

const FORMAT_OPTIONS = [
  { key: "reel", label: "Reels" },
  { key: "carousel", label: "Carousel" },
  { key: "post", label: "Post" },
  { key: "stories", label: "Stories" },
];

const GOAL_OPTIONS = [
  { key: "growth", label: "Growth" },
  { key: "engagement", label: "Engagement" },
  { key: "trust", label: "Trust" },
  { key: "education", label: "Education" },
  { key: "connection", label: "Connection" },
  { key: "sales", label: "Sales" },
];

async function start(ctx) {
  const context = await buildUserContext(ctx.from.id);
  if (!context.pillars.length) {
    return ctx.reply("Сначала пройди настройку стратегии — отправь /start");
  }
  state.set(ctx.from.id, { flow: "ideas", step: "pillar", data: {} });
  await ctx.reply(
    "Для какого пиллара нужны идеи?",
    Markup.inlineKeyboard(
      context.pillars.map((p) => Markup.button.callback(p.label, "idea_pillar_" + p.key)),
      { columns: 1 }
    )
  );
}

async function handleAction(ctx) {
  const s = state.get(ctx.from.id);
  if (!s || s.flow !== "ideas") return false;
  const data = ctx.callbackQuery.data;

  if (s.step === "pillar" && data.startsWith("idea_pillar_")) {
    s.data.pillarKey = data.replace("idea_pillar_", "");
    s.step = "format";
    state.set(ctx.from.id, s);
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "Какой формат?",
      Markup.inlineKeyboard(
        FORMAT_OPTIONS.map((f) => Markup.button.callback(f.label, "idea_format_" + f.key)),
        { columns: 2 }
      )
    );
    return true;
  }

  if (s.step === "format" && data.startsWith("idea_format_")) {
    s.data.format = data.replace("idea_format_", "");
    s.step = "goal";
    state.set(ctx.from.id, s);
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "Какая цель?",
      Markup.inlineKeyboard(
        GOAL_OPTIONS.map((g) => Markup.button.callback(g.label, "idea_goal_" + g.key)),
        { columns: 2 }
      )
    );
    return true;
  }

  if (s.step === "goal" && data.startsWith("idea_goal_")) {
    const goal = data.replace("idea_goal_", "");
    await ctx.answerCbQuery();
    await ctx.editMessageText("Генерирую 10 идей... 🤎");
    await finishIdeas(ctx, { pillarKey: s.data.pillarKey, format: s.data.format, goal });
    return true;
  }

  return false;
}

async function finishIdeas(ctx, { pillarKey, format, goal }) {
  const telegramId = ctx.from.id;
  const context = await buildUserContext(telegramId);
  let ideas;
  try {
    ideas = await generateIdeas(context, { pillarKey, format, goal });
  } catch (err) {
    console.error("Ошибка генерации идей:", err);
    state.clear(telegramId);
    await ctx.reply("Не получилось сгенерировать идеи, попробуй ещё раз: /ideas");
    return;
  }
  state.clear(telegramId);

  const text = ideas
    .map((idea, i) => `${i + 1}. ${idea.topic}\nХук: ${idea.hook}\nСтруктура: ${idea.structure}\nCTA: ${idea.cta}\nВизуал: ${idea.visual}`)
    .join("\n\n");

  await sendLong(ctx, `Идеи для тебя:\n\n${text}`);
}

module.exports = { start, handleAction };
