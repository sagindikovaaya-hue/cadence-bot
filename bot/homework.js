const { supabase } = require("../lib/supabase");
const { todayDate } = require("./today");

const TASK_POOL = [
  "Ответь на 10 комментариев под последними публикациями",
  "Напиши 5 потенциальных hooks для будущих Reels",
  "Проанализируй свой лучший Reel за месяц — почему он сработал?",
  "Сними немного B-roll для будущих Stories",
  "Сделай 5 Stories сегодня",
  "Напиши 3 варианта CTA для следующей публикации",
  "Посмотри статистику за неделю",
  "Найди 3 темы у конкурентов, которые можно переосмыслить под себя",
  "Запиши 5 болей своей аудитории",
  "Сними talking-head видео на любую тему из своих пилларов",
  "Подготовь контент на завтра заранее",
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function pickTask(telegramId, date) {
  return TASK_POOL[hash(`${telegramId}-${date}`) % TASK_POOL.length];
}

async function ensureTodayHomework(telegramId) {
  const date = todayDate();
  const { data: existing } = await supabase.from("homework_items").select("*").eq("user_id", telegramId).eq("date", date).maybeSingle();
  if (existing) return existing;

  const { data: created } = await supabase
    .from("homework_items")
    .upsert({ user_id: telegramId, date, task: pickTask(telegramId, date) }, { onConflict: "user_id,date" })
    .select()
    .single();
  return created;
}

async function handleHomework(ctx) {
  const item = await ensureTodayHomework(ctx.from.id);
  await ctx.reply(`Задание на сегодня:\n\n${item.task}`, {
    reply_markup: item.done ? undefined : { inline_keyboard: [[{ text: "Готово ✅", callback_data: "homework_done_" + item.id }]] },
  });
}

async function handleDone(ctx) {
  const id = ctx.callbackQuery.data.replace("homework_done_", "");
  await supabase.from("homework_items").update({ done: true }).eq("id", id);
  await ctx.answerCbQuery("Отлично! 🔥");
  await ctx.editMessageText("Задание выполнено ✅");
}

module.exports = { handleHomework, handleDone, ensureTodayHomework };
