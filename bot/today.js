const { supabase } = require("../lib/supabase");
const { buildUserContext } = require("../lib/context");
const { generatePlan } = require("../lib/ai/planGenerator");

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureTodayItem(telegramId) {
  const today = todayDate();
  const { data: existing } = await supabase
    .from("content_items")
    .select("*")
    .eq("user_id", telegramId)
    .eq("scheduled_date", today)
    .maybeSingle();

  if (existing) return existing;

  const context = await buildUserContext(telegramId);
  if (!context.pillars.length) return null;

  const items = await generatePlan(context, 1);
  if (!items.length) return null;

  const item = items[0];
  const { data: created } = await supabase
    .from("content_items")
    .upsert(
      {
        user_id: telegramId,
        scheduled_date: today,
        format: item.format,
        pillar_key: item.pillar_key,
        topic: item.topic,
        hook: item.hook,
        goal: item.goal,
        cta: item.cta,
      },
      { onConflict: "user_id,scheduled_date" }
    )
    .select()
    .single();

  return created;
}

function formatMessage(item) {
  return `Сегодня\n\n${item.format.toUpperCase()}\n\n«${item.topic}»\n\nЦель:\n→ ${item.goal}\n\nХук:\n→ ${item.hook}\n\nCTA:\n→ ${item.cta}`;
}

async function touchStreak(telegramId) {
  const today = todayDate();
  const { data: user } = await supabase
    .from("users")
    .select("last_active_date, streak_current, streak_best")
    .eq("telegram_id", telegramId)
    .single();
  if (!user || user.last_active_date === today) return;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const newStreak = user.last_active_date === yesterday ? (user.streak_current || 0) + 1 : 1;
  const newBest = Math.max(newStreak, user.streak_best || 0);

  await supabase
    .from("users")
    .update({ last_active_date: today, streak_current: newStreak, streak_best: newBest })
    .eq("telegram_id", telegramId);
}

async function handleToday(ctx) {
  await ctx.sendChatAction("typing");
  const item = await ensureTodayItem(ctx.from.id);
  if (!item) {
    return ctx.reply("Сначала пройди настройку стратегии — отправь /start");
  }
  await touchStreak(ctx.from.id);
  await ctx.reply(formatMessage(item));
}

module.exports = { handleToday, ensureTodayItem, touchStreak, todayDate };
