const { supabase } = require("./supabase");

async function buildUserContext(telegramId) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: user }, { data: pillars }, { data: strategy }, { data: recentItems }] = await Promise.all([
    supabase.from("users").select("*").eq("telegram_id", telegramId).single(),
    supabase.from("content_pillars").select("*").eq("user_id", telegramId),
    supabase
      .from("strategies")
      .select("*")
      .eq("user_id", telegramId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("content_items")
      .select("scheduled_date, format, pillar_key, topic, goal, status")
      .eq("user_id", telegramId)
      .gte("scheduled_date", since)
      .order("scheduled_date", { ascending: false }),
  ]);

  return {
    user,
    pillars: pillars || [],
    strategy: strategy ? strategy.summary : null,
    recentItems: recentItems || [],
  };
}

module.exports = { buildUserContext };
