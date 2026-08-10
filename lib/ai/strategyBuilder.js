const { generateJSON } = require("./client");

const GOAL_ENUM = ["growth", "engagement", "trust", "education", "connection", "sales", "retention"];

const STRATEGY_TOOL = {
  name: "build_strategy",
  description: "Строит контент-стратегию и контент-пиллары для инфлюенсера на основе ответов онбординга.",
  input_schema: {
    type: "object",
    properties: {
      main_goal: { type: "string" },
      secondary_goal: { type: "string" },
      audience: { type: "string" },
      frequency_summary: { type: "string" },
      pillars: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "короткий английский slug, snake_case, уникальный" },
            label: { type: "string", description: "название пиллара на русском" },
            description: { type: "string" },
            target_percent: { type: "integer" },
            goal: { type: "string", enum: GOAL_ENUM },
            formats: { type: "array", items: { type: "string", enum: ["reel", "carousel", "post", "stories"] } },
          },
          required: ["key", "label", "description", "target_percent", "goal", "formats"],
        },
      },
    },
    required: ["main_goal", "audience", "pillars"],
  },
};

async function buildStrategy(answers) {
  const prompt = `Ниша: ${answers.niche}
Аудитория: ${answers.audience}
Главная цель: ${answers.goal}
Частота публикаций: ${answers.frequency}
Комфортные форматы: ${answers.formats}

Собери контент-стратегию для этого инфлюенсера: главную и второстепенную цель, аудиторию, и 3-5 контент-пилларов с процентами (в сумме 100%). У каждого пиллара — цель строго из списка [${GOAL_ENUM.join(", ")}] и подходящие форматы.`;

  return generateJSON({
    system:
      "Ты — опытный контент-стратег для инфлюенсеров и блогеров. Отвечай только вызовом инструмента build_strategy, без лишнего текста вне инструмента.",
    prompt,
    tool: STRATEGY_TOOL,
  });
}

module.exports = { buildStrategy, GOAL_ENUM };
