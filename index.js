const http = require("http");
http.createServer((req, res) => res.end("Cadence bot is running")).listen(process.env.PORT || 3000);
const { Telegraf, Markup } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const WEB_APP_URL = process.env.WEB_APP_URL;

const onboardingState = new Map();

const DEFAULT_PILLARS = [
  { key: "growth", label: "Рост" },
  { key: "behind", label: "Закулисье" },
  { key: "tips", label: "Советы" },
];

async function getOrCreateUser(ctx) {
  const telegramId = ctx.from.id;
  const { data: existing } = await supabase
    .from("users").select("*").eq("telegram_id", telegramId).single();
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
    .select().single();

  if (error) { console.error("Ошибка создания пользователя:", error); throw error; }
  return created;
}

async function saveNiche(telegramId, niche) {
  await supabase.from("users").update({ niche }).eq("telegram_id", telegramId);
}

async function completeOnboarding(telegramId, pillars) {
  await supabase.from("users").update({ pillars, onboarding_done: true }).eq("telegram_id", telegramId);
}

bot.start(async (ctx) => {
  const user = await getOrCreateUser(ctx);
  if (user.onboarding_done) {
    return ctx.reply(
      "С возвращением! Открывайте план кнопкой ниже.",
      Markup.inlineKeyboard([Markup.button.webApp("Открыть планировщик", WEB_APP_URL)])
    );
  }
  onboardingState.set(ctx.from.id, { step: "ask_niche" });
  await ctx.reply(
    "Привет! Я Cadence. Помогаю планировать контент и не терять ритм публикаций. В какой нише ты работаешь?"
  );
});

bot.on("text", async (ctx) => {
  const state = onboardingState.get(ctx.from.id);
  if (!state) return;
  if (state.step === "ask_niche") {
    const niche = ctx.message.text.trim();
    await saveNiche(ctx.from.id, niche);
    onboardingState.set(ctx.from.id, { step: "choose_pillars", selected: [] });
    return ctx.reply("Отлично! Теперь выбери контент-пиллары:", pillarsKeyboard([]));
  }
});

function pillarsKeyboard(selected) {
  const buttons = DEFAULT_PILLARS.map((p) => {
    const mark = selected.includes(p.key) ? "OK " : "";
    return Markup.button.callback(mark + p.label, "pillar_" + p.key);
  });
  buttons.push(Markup.button.callback("Готово", "pillars_done"));
  return Markup.inlineKeyboard(buttons, { columns: 1 });
}

bot.action(/pillar_(.+)/, async (ctx) => {
  const key = ctx.match[1];
  const state = onboardingState.get(ctx.from.id);
  if (!state || state.step !== "choose_pillars") return ctx.answerCbQuery();
  if (state.selected.includes(key)) {
    state.selected = state.selected.filter((k) => k !== key);
  } else {
    state.selected.push(key);
  }
  onboardingState.set(ctx.from.id, state);
  await ctx.editMessageReplyMarkup(pillarsKeyboard(state.selected).reply_markup);
  await ctx.answerCbQuery();
});

bot.action("pillars_done", async (ctx) => {
  const state = onboardingState.get(ctx.from.id);
  if (!state || state.selected.length === 0) {
    return ctx.answerCbQuery("Выбери хотя бы один пиллар", { show_alert: true });
  }
  const pillars = DEFAULT_PILLARS.filter((p) => state.selected.includes(p.key));
  await completeOnboarding(ctx.from.id, pillars);
  onboardingState.delete(ctx.from.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText("Готово! Твои пиллары сохранены.");
  await ctx.reply(
    "Всё настроено. Открывай планировщик кнопкой ниже:",
    Markup.inlineKeyboard([Markup.button.webApp("Открыть планировщик", WEB_APP_URL)])
  );
});

bot.command("status", async (ctx) => {
  const user = await getOrCreateUser(ctx);
  const statusLabel = user.subscription_status === "trial"
    ? "пробный период до " + new Date(user.subscription_ends_at).toLocaleDateString("ru-RU")
    : user.subscription_status;
  ctx.reply("Статус подписки: " + statusLabel);
});

bot.command("planner", async (ctx) => {
  const user = await getOrCreateUser(ctx);
  if (!user.onboarding_done) {
    return ctx.reply("Сначала пройди короткую настройку — отправь /start");
  }
  return ctx.reply(
    "Открывай планировщик:",
    Markup.inlineKeyboard([Markup.button.webApp("Открыть планировщик", WEB_APP_URL)])
  );
});

bot.command("help", async (ctx) => {
  ctx.reply("Вот что я умею: /start, /planner, /status");
});

bot.launch();async function generateIdeas(niche, pillarLabel) {
  const prompt = "Ты эксперт по контент-стратегии для ниши: " + niche + ". Придумай ровно 5 идей постов для контент-пиллара \"" + pillarLabel + "\". Формат ответа ТОЛЬКО валидный JSON без markdown: [{\"title\":\"...\",\"hook\":\"...\"}]. Идеи должны быть конкретными и разными по формату.";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const rawText = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

bot.command("ideas", async (ctx) => {
  const user = await getOrCreateUser(ctx);
  if (!user.onboarding_done || !user.pillars || user.pillars.length === 0) {
    return ctx.reply("Сначала пройди настройку — отправь /start");
  }
  await ctx.reply("Придумываю идеи, секунду...");
  const pillar = user.pillars[0];
  try {
    const ideas = await generateIdeas(user.niche, pillar.label);
    const today = new Date().toISOString().slice(0, 10);
    const monday = new Date();
    monday.setDate(monday.getDate() - monday.getDay() + 1);
    const weekOf = monday.toISOString().slice(0, 10);

    for (const idea of ideas) {
      await supabase.from("weekly_ideas").insert({
        user_id: user.id,
        title: idea.title,
        hook: idea.hook,
        pillar_key: pillar.key,
        week_of: weekOf,
      });
    }

    let text = "Вот идеи для пиллара \"" + pillar.label + "\":\n\n";
    ideas.forEach((idea, i) => {
      text += (i + 1) + ". " + idea.title + "\n" + idea.hook + "\n\n";
    });
    ctx.reply(text);
  } catch (err) {
    console.error("Ошибка генерации идей:", err);
    ctx.reply("Не получилось придумать идеи, попробуй ещё раз чуть позже.");
  }
});



console.log("Cadence bot zapushen");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
