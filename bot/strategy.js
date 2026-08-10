const { supabase } = require("../lib/supabase");

async function handleStrategy(ctx) {
  const telegramId = ctx.from.id;
  const { data: strategy } = await supabase
    .from("strategies")
    .select("*")
    .eq("user_id", telegramId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!strategy) {
    return ctx.reply("Стратегия ещё не собрана — отправь /start");
  }

  const { data: pillars } = await supabase.from("content_pillars").select("*").eq("user_id", telegramId);
  const pillarsText = (pillars || []).map((p) => `• ${p.label} — ${p.target_percent}% (${p.goal})`).join("\n");

  await ctx.reply(
    `Твоя стратегия 🤎\n\nГлавная цель: ${strategy.summary.main_goal}\n${
      strategy.summary.secondary_goal ? `Вторичная цель: ${strategy.summary.secondary_goal}\n` : ""
    }Аудитория: ${strategy.summary.audience}\n\nКонтент-пиллары:\n${pillarsText}`
  );
}

module.exports = { handleStrategy };
