require("dotenv").config();

const http = require("http");
http.createServer((req, res) => res.end("Cadence bot is running")).listen(process.env.PORT || 3000);

const { Telegraf } = require("telegraf");
const { supabase } = require("./lib/supabase");
const onboarding = require("./bot/onboarding");
const { handleToday, touchStreak } = require("./bot/today");
const { handlePlan, handleReplan } = require("./bot/plan");
const ideas = require("./bot/ideas");
const { handleStrategy } = require("./bot/strategy");
const { handleHomework, handleDone: handleHomeworkDone } = require("./bot/homework");

const bot = new Telegraf(process.env.BOT_TOKEN);

async function getOrCreateUser(ctx) {
  const telegramId = ctx.from.id;
  const { data: existing } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      telegram_id: telegramId,
      telegram_username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      subscription_status: "trial",
      subscription_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .select()
    .single();

  if (error) {
    console.error("Ошибка создания пользователя:", error);
    throw error;
  }
  return created;
}

bot.start(async (ctx) => {
  const user = await getOrCreateUser(ctx);
  if (user.onboarding_done) {
    await touchStreak(ctx.from.id);
    return ctx.reply(
      `С возвращением! 🔥 ${user.streak_current || 0} дней подряд.\n\nЧто дальше:\n/today — план на сегодня\n/plan — план на неделю\n/ideas — идеи для контента\n/strategy — твоя стратегия\n/homework — задание на сегодня`
    );
  }
  await onboarding.start(ctx);
});

bot.on("text", async (ctx) => {
  await onboarding.handleText(ctx);
});

bot.on("callback_query", async (ctx) => {
  if (await onboarding.handleAction(ctx)) return;
  if (await ideas.handleAction(ctx)) return;
  if (ctx.callbackQuery.data && ctx.callbackQuery.data.startsWith("homework_done_")) {
    return handleHomeworkDone(ctx);
  }
  return ctx.answerCbQuery();
});

bot.command("today", handleToday);
bot.command("planner", handleToday);
bot.command("plan", handlePlan);
bot.command("replan", handleReplan);
bot.command("ideas", ideas.start);
bot.command("strategy", handleStrategy);
bot.command("homework", handleHomework);

bot.command("status", async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const statusLabel =
    user.subscription_status === "trial"
      ? "пробный период до " + new Date(user.subscription_ends_at).toLocaleDateString("ru-RU")
      : user.subscription_status;
  ctx.reply(`Статус подписки: ${statusLabel}\nStreak: 🔥 ${user.streak_current || 0} дней (лучший: ${user.streak_best || 0})`);
});

bot.command("help", async (ctx) => {
  ctx.reply(
    "Вот что я умею:\n/start — начать / посмотреть меню\n/today — план на сегодня\n/plan — план на 7 дней\n/replan — пересобрать план\n/ideas — идеи для контента\n/strategy — твоя стратегия\n/homework — задание на сегодня\n/status — статус подписки"
  );
});

bot.catch((err) => console.error("Ошибка бота:", err));

bot.launch();
console.log("Cadence bot zapushen");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
