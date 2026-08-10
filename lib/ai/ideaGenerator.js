const { generateJSON } = require("./client");

const IDEAS_TOOL = {
  name: "generate_ideas",
  description: "Генерирует 10 идей для контента, привязанных к нише, пиллару, формату и цели.",
  input_schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        minItems: 10,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            hook: { type: "string" },
            topic: { type: "string" },
            structure: { type: "string" },
            cta: { type: "string" },
            visual: { type: "string" },
            goal: { type: "string" },
          },
          required: ["hook", "topic", "structure", "cta", "visual", "goal"],
        },
      },
    },
    required: ["ideas"],
  },
};

async function generateIdeas(context, { pillarKey, format, goal }) {
  const pillar = context.pillars.find((p) => p.key === pillarKey);
  const recentTopics = context.recentItems.map((i) => i.topic).filter(Boolean).join("; ") || "нет данных";

  const prompt = `Ниша: ${context.user.niche}
Аудитория: ${(context.strategy && context.strategy.audience) || context.user.audience || "не указана"}
Пиллар: ${pillar ? `${pillar.label} — ${pillar.description}` : pillarKey}
Формат: ${format}
Цель: ${goal}
Уже использованные темы за последние 14 дней (не повторять): ${recentTopics}

Дай 10 идей контента для этого сочетания пиллара, формата и цели.`;

  const result = await generateJSON({
    system: "Ты — AI генератор идей контента для инфлюенсеров. Отвечай только вызовом инструмента generate_ideas.",
    prompt,
    tool: IDEAS_TOOL,
  });
  return result.ideas || [];
}

module.exports = { generateIdeas };
