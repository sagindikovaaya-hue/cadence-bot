const { supabase } = require("../lib/supabase");
const { buildUserContext } = require("../lib/context");
const { generatePlan } = require("../lib/ai/planGenerator");
const { sendLong } = require("../lib/telegram");
const { todayDate } = require("./today");

const DAYS = 7;

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
}

async function loadOrGeneratePlan(telegramId) {
  const today = todayDate();
  const in7days = new Date(Date.now() + (DAYS - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("content_items")
    .select("*")
    .eq("user_id", telegramId)
    .gte("scheduled_date", today)
    .lte("scheduled_date", in7days)
    .order("scheduled_date", { ascending: true });

  if (existing && existing.length) return existing;

  const context = await buildUserContext(telegramId);
  if (!context.pillars.length) return null;

  const generated = await generatePlan(context, DAYS);
  const rows = generated.map((item) => ({
    user_id: telegramId,
    scheduled_date: new Date(Date.now() + item.day_offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    format: item.format,
    pillar_key: item.pillar_key,
    topic: item.topic,
    hook: item.hook,
    goal: item.goal,
    cta: item.cta,
  }));

  const { data: inserted } = await supabase.from("content_items").upsert(rows, { onConflict: "user_id,scheduled_date" }).select();
  return (inserted || []).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
}

async function handlePlan(ctx) {
  await ctx.sendChatAction("typing");
  const items = await loadOrGeneratePlan(ctx.from.id);
  if (!items) {
    return ctx.reply("Сначала пройди настройку стратегии — отправь /start");
  }

  const text = items
    .map((i) => `${formatDate(i.scheduled_date)} · ${i.format} · ${i.pillar_key}\n«${i.topic}» — ${i.goal}`)
    .join("\n\n");

  await sendLong(ctx, `План на ${DAYS} дней:\n\n${text}\n\nЧтобы пересобрать план заново — /replan`);
}

async function handleReplan(ctx) {
  const telegramId = ctx.from.id;
  const today = todayDate();
  await supabase.from("content_items").delete().eq("user_id", telegramId).gte("scheduled_date", today);
  await handlePlan(ctx);
}

module.exports = { handlePlan, handleReplan };
