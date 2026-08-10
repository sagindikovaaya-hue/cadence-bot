const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

async function generateJSON({ system, prompt, tool }) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: prompt }],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a tool_use block");
  return toolUse.input;
}

module.exports = { generateJSON };
