const { Markup } = require("telegraf");
const { supabase } = require("../lib/supabase");
const { buildStrategy } = require("../lib/ai/strategyBuilder");
const state = require("./state");

const GOAL_OPTIONS = [
  { key: "grow", label: "Рост аудитории" },
  { key: "engagement", label: "Вовлечённость" },
  { key: "personal_brand", label: "Личный бренд" },
  { key: "sales", label: "Продажи" },
  { key: "monetization", label: "Монетизация" },
];

const FREQUENCY_OPTIONS = [
  { key: "2-3_week", label: "2-3 раза в неделю" },
  { key: "4-5_week", label: "4-5 раз в неделю" },
  { key: "daily", label: "Каждый день" },
];

const FORMAT_OPTIONS = [
  { key: "reel", label: "Reels" },
  { key: "carousel", label: "Carousel" },
  { key: "post", label: "Post" },
  { key: "stories", label: "Stories" },
];

function goalKeyboard() {
  return Markup.inlineKeyboard(
    GOAL_OPTIONS.map((g) => Markup.button.callback(g.label, "ob_goal_" + g.key)),
    { columns: 1 }
  );
}

function frequencyKeyboard() {
  return Markup.inlineKeyboard(
    FREQUENCY_OPTIONS.map((f) => Markup.button.callback(f.label, "ob_freq_" + f.key)),
    { columns: 1 }
  );
}

function formatsKeyboard(selected) {
  const buttons = FORMAT_OPTIONS.map((f) => {
    const mark = selected.includes(f.key) ? "✅ " : "";
    return Markup.button.callback(mark + f.label, "ob_format_" + f.key);
  });
  buttons.push(Markup.button.callback("Готово", "ob_formats_done"));
  return Markup.inlineKeyboard(buttons, { columns: 1 });
}

async function start(ctx) {
  state.set(ctx.from.id, { flow: "onboarding", step: "ask_niche", data: {} });
  await ctx.reply(
    "Привет! Я Cadence — твой AI контент-менеджер. Помогаю выстроить стратегию и не терять ритм публикаций.\n\nРасскажи, в какой нише ты работаешь?"
  );
}

async function handleText(ctx) {
  const s = state.get(ctx.from.id);
  if (!s || s.flow !== "onboarding") return false;

  if (s.step === "ask_niche") {
    s.data.niche = ctx.message.text.trim();
    s.step = "ask_audience";
    state.set(ctx.from.id, s);
    await ctx.reply("Кто твоя целевая аудитория? Например: «женщины 25-35, начинающие предприниматели»");
    return true;
  }

  if (s.step === "ask_audience") {
    s.data.audience = ctx.message.text.trim();
    s.step = "ask_goal";
    state.set(ctx.from.id, s);
    await ctx.reply("Какая твоя главная цель?", goalKeyboard());
    return true;
  }

  return true;
}

async function handleAction(ctx) {
  const s = state.get(ctx.from.id);
  if (!s || s.flow !== "onboarding") return false;
  const data = ctx.callbackQuery.data;

  if (s.step === "ask_goal" && data.startsWith("ob_goal_")) {
    const key = data.replace("ob_goal_", "");
    s.data.goal = (GOAL_OPTIONS.find((g) => g.key === key) || {}).label || key;
    s.step = "ask_frequency";
    state.set(ctx.from.id, s);
    await ctx.answerCbQuery();
    await ctx.editMessageText("Как часто хочешь публиковаться?", frequencyKeyboard());
    return true;
  }

  if (s.step === "ask_frequency" && data.startsWith("ob_freq_")) {
    const key = data.replace("ob_freq_", "");
    s.data.frequency = (FREQUENCY_OPTIONS.find((f) => f.key === key) || {}).label || key;
    s.step = "ask_formats";
    s.data.formats = [];
    state.set(ctx.from.id, s);
    await ctx.answerCbQuery();
    await ctx.editMessageText("Какие форматы тебе комфортны? Выбери один или несколько:", formatsKeyboard([]));
    return true;
  }

  if (s.step === "ask_formats" && data.startsWith("ob_format_")) {
    const key = data.replace("ob_format_", "");
    if (s.data.formats.includes(key)) {
      s.data.formats = s.data.formats.filter((k) => k !== key);
    } else {
      s.data.formats.push(key);
    }
    state.set(ctx.from.id, s);
    await ctx.editMessageReplyMarkup(formatsKeyboard(s.data.formats).reply_markup);
    await ctx.answerCbQuery();
    return true;
  }

  if (s.step === "ask_formats" && data === "ob_formats_done") {
    if (s.data.formats.length === 0) {
      await ctx.answerCbQuery("Выбери хотя бы один формат", { show_alert: true });
      return true;
    }
    await ctx.answerCbQuery();
    await ctx.editMessageText("Собираю твою стратегию... 🤎");
    await finishOnboarding(ctx, s.data);
    return true;
  }

  return false;
}

async function finishOnboarding(ctx, answers) {
  const telegramId = ctx.from.id;
  const formatLabels = answers.formats.map((k) => (FORMAT_OPTIONS.find((f) => f.key === k) || {}).label || k).join(", ");

  let strategy;
  try {
    strategy = await buildStrategy({
      niche: answers.niche,
      audience: answers.audience,
      goal: answers.goal,
      frequency: answers.frequency,
      formats: formatLabels,
    });
  } catch (err) {
    console.error("Ошибка генерации стратегии:", err);
    state.clear(telegramId);
    await ctx.reply("Не получилось собрать стратегию — попробуй /start ещё раз чуть позже.");
    return;
  }

  await supabase
    .from("users")
    .update({
      niche: answers.niche,
      audience: answers.audience,
      primary_goal: answers.goal,
      posting_frequency: { label: answers.frequency },
      formats: answers.formats,
      onboarding_done: true,
    })
    .eq("telegram_id", telegramId);

  await supabase.from("strategies").update({ is_active: false }).eq("user_id", telegramId).eq("is_active", true);
  await supabase.from("strategies").insert({
    user_id: telegramId,
    summary: {
      main_goal: strategy.main_goal,
      secondary_goal: strategy.secondary_goal,
      audience: strategy.audience,
      frequency_summary: strategy.frequency_summary,
    },
  });

  await supabase.from("content_pillars").delete().eq("user_id", telegramId);
  if (strategy.pillars && strategy.pillars.length) {
    await supabase.from("content_pillars").insert(
      strategy.pillars.map((p) => ({
        user_id: telegramId,
        key: p.key,
        label: p.label,
        description: p.description,
        target_percent: p.target_percent,
        goal: p.goal,
        formats: p.formats,
      }))
    );
  }

  state.clear(telegramId);

  const pillarsText = (strategy.pillars || []).map((p) => `• ${p.label} — ${p.target_percent}% (${p.goal})`).join("\n");

  await ctx.reply(
    `Готово! Твоя стратегия 🤎\n\nГлавная цель: ${strategy.main_goal}\n${
      strategy.secondary_goal ? `Вторичная цель: ${strategy.secondary_goal}\n` : ""
    }Аудитория: ${strategy.audience}\n\nКонтент-пиллары:\n${pillarsText}\n\nЧто дальше:\n/today — план на сегодня\n/plan — план на неделю\n/ideas — идеи для контента\n/strategy — твоя стратегия`
  );
}

module.exports = { start, handleText, handleAction };
