async function sendLong(ctx, text, chunkSize = 3500) {
  if (text.length <= chunkSize) return ctx.reply(text);

  const blocks = text.split("\n\n");
  let current = "";
  for (const block of blocks) {
    const next = current ? current + "\n\n" + block : block;
    if (next.length > chunkSize && current) {
      await ctx.reply(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current) await ctx.reply(current);
}

module.exports = { sendLong };
