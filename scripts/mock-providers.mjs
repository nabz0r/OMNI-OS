import http from "node:http";
import { pathToFileURL } from "node:url";

export async function startMockProvider({
  port = 4101,
  name = "local-lab",
  kind = "local",
} = {}) {
  const observations = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health" || req.url === "/metrics") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          simulation: true,
          name,
          kind,
          requests: observations.length,
          observations,
        }),
      );
    }
    if (req.url === "/v1/models") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          object: "list",
          data: [
            { id: "omni-synthetic", object: "model", owned_by: "simulation" },
          ],
        }),
      );
    }
    if (
      !["/v1/chat/completions", "/v1/messages", "/api/chat"].includes(
        req.url,
      ) ||
      req.method !== "POST"
    ) {
      res.statusCode = 404;
      return res.end();
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 65536) {
        res.statusCode = 413;
        return res.end();
      }
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks));
    } catch {
      res.statusCode = 400;
      return res.end('{"error":"invalid_json"}');
    }
    const messages = body.messages ?? [];
    const text = [
      body.system ?? "",
      ...messages.map((m) =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      ),
    ].join(" ");
    const promptTokens = Math.ceil(text.length / 4);
    const marker = /SIM_CANARY_[A-Z0-9_]+/.exec(text)?.[0] ?? null;
    // All recorded content is synthetic. Never enable this fixture in production.
    observations.push({
      at: new Date().toISOString(),
      model: body.model,
      tokens: promptTokens,
      memory_included: Boolean(marker),
      kind,
    });
    const content = `[SIMULATION · ${name}] Synthetic task completed. ${marker ? "Authorized project context was available." : "No private memory was supplied."}`;
    await new Promise((resolve) =>
      setTimeout(resolve, 15 + ((observations.length * 17) % 60)),
    );
    if (body.stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });
      const pieces = content.match(/.{1,24}/g) ?? [];
      const anthropic = req.url === "/v1/messages";
      if (anthropic) {
        res.write(
          `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "sim-message", type: "message", role: "assistant", model: body.model, content: [], usage: { input_tokens: promptTokens, output_tokens: 0 } } })}\n\n`,
        );
        res.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        );
      }
      for (const piece of pieces) {
        if (res.destroyed) break;
        res.write(
          anthropic
            ? `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } })}\n\n`
            : `data: ${JSON.stringify({ id: "sim-stream", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3));
      }
      res.end(
        anthropic
          ? 'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":24}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
          : `data: ${JSON.stringify({ id: "sim-stream", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: promptTokens, completion_tokens: 24, total_tokens: promptTokens + 24 } })}\n\ndata: [DONE]\n\n`,
      );
    } else {
      res.setHeader("Content-Type", "application/json");
      const usage = {
        prompt_tokens: promptTokens,
        completion_tokens: 24,
        total_tokens: promptTokens + 24,
      };
      res.end(
        JSON.stringify(
          req.url === "/v1/messages"
            ? {
                id: "sim-message",
                type: "message",
                role: "assistant",
                content: [{ type: "text", text: content }],
                stop_reason: "end_turn",
                usage: { input_tokens: promptTokens, output_tokens: 24 },
              }
            : {
                id: "sim-completion",
                object: "chat.completion",
                model: body.model ?? "omni-synthetic",
                choices: [
                  {
                    index: 0,
                    message: { role: "assistant", content },
                    finish_reason: "stop",
                  },
                ],
                usage,
              },
        ),
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    server,
    observations,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const local = await startMockProvider({
    port: 4101,
    name: "Local LLM · synthetic",
    kind: "local",
  });
  const cloud = await startMockProvider({
    port: 4102,
    name: "SaaS LLM · synthetic",
    kind: "saas-simulated-on-loopback",
  });
  process.stdout.write(
    "Synthetic providers ready on 127.0.0.1:4101 and :4102. No external inference.\n",
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await Promise.all([local.close(), cloud.close()]);
      process.exit(0);
    });
}
