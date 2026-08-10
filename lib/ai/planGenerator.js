const { generateJSON } = require("./client");

const PLAN_TOOL = {
  name: "build_plan",
  description: "Генерирует контент-план на N дней вперёд для инфлюенсера.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            day_offset: { type: "integer", description: "0 = сегодня, 1 = завтра, и т.д." },
            format: { type: "string", enum: ["reel", "carousel", "post", "stories"] },
            pillar_key: { type: "string" },
            topic: { type: "string" },
            hook: { type: "string" },
            goal: { type: "string" },
            cta: { type: "string" },
          },
          required: ["day_offset", "format", "pillar_key", "topic", "hook", "goal", "cta"],
        },
      },
    },
    required: ["items"],
  },
};

async function generatePlan(context, days) {
  const pillarsDesc =
    context.pillars.map((p) => `- ${p.key} (${p.label}, ${p.target_percent}%, цель: ${p.goal}, форматы: ${(p.formats || []).join("/")})`).join("\n") ||
    "нет пилларов";

  const recentDesc =
    context.recentItems
      .slice(0, 14)
      .map((i) => `${i.scheduled_date}: ${i.format}/${i.pillar_key} — ${i.topic}`)
      .join("\n") || "нет данных";

  const prompt = `Стратегия: ${JSON.stringify(context.strategy)}

Контент-пиллары:
${pillarsDesc}

Контент за последние 14 дней (не повторяй эти темы):
${recentDesc}

Сгенерируй план ровно на ${days} дней (day_offset от 0 до ${days - 1}, 0 = сегодня). Держи баланс пилларов близко к их процентам. Темы не должны повторять недавние.`;

  const result = await generateJSON({
    system: "Ты — AI контент-стратег для инфлюенсеров. Отвечай только вызовом инструмента build_plan.",
    prompt,
    tool: PLAN_TOOL,
  });
  return result.items || [];
}

module.exports = { generatePlan };
