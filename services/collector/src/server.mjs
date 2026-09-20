import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "redis";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { SqliteStore, RedisStore, GROUPS } from "./store.mjs";

export const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "report_id", "week", "epsilon", "histograms"],
  properties: {
    schema_version: { const: 1 },
    epsilon: { const: 1 },
    report_id: {
      type: "string",
      pattern:
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
    },
    week: {
      type: "string",
      pattern: "^20[0-9]{2}-W(0[1-9]|[1-4][0-9]|5[0-3])$",
    },
    histograms: {
      type: "object",
      additionalProperties: false,
      required: GROUPS,
      properties: Object.fromEntries(
        GROUPS.map((group) => [
          group,
          {
            type: "array",
            minItems: 8,
            maxItems: 8,
            items: { type: "number", minimum: -1e6, maximum: 1e6 },
          },
        ]),
      ),
    },
  },
};

export function isoWeek(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(
    ((d - new Date(Date.UTC(year, 0, 1))) / 86400000 + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export async function createServer(options = {}) {
  const simulation = options.simulation ?? process.env.OMNI_SIMULATION === "1";
  const minimum = Number(
    options.minimum ?? process.env.OMNI_MIN_REPORTS ?? 10000,
  );
  if (
    !Number.isInteger(minimum) ||
    minimum < 1 ||
    (!simulation && minimum < 10000)
  )
    throw new Error(
      "Production publication threshold must be at least 10000 reports.",
    );
  let store = options.store;
  if (simulation && !store && process.env.REDIS_URL)
    throw new Error(
      "Simulation requires an isolated explicit store; inherited REDIS_URL is forbidden.",
    );
  if (!store && process.env.REDIS_URL) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => {}); // Fastify reports operation failure without logging credentials.
    await client.connect();
    store = new RedisStore(client);
  }
  if (!store && !simulation && process.env.NODE_ENV === "production")
    throw new Error("REDIS_URL is required in production.");
  store ??= new SqliteStore(
    resolve(
      process.env.OMNI_COLLECTOR_DB ??
        (simulation
          ? ".omni/simulation-collector.sqlite"
          : ".omni/collector.sqlite"),
    ),
  );
  const app = Fastify({
    logger: false,
    bodyLimit: 8192,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const sockets = new Set();
  await app.register(cors, {
    origin: [
      "http://localhost:3006",
      "http://127.0.0.1:3006",
      "tauri://localhost",
      "http://tauri.localhost",
    ],
    methods: ["GET", "POST"],
  });
  await app.register(rateLimit, {
    max: options.rateLimit ?? 60,
    timeWindow: "1 minute",
  });
  await app.register(websocket, { options: { maxPayload: 1024 } });
  const snapshot = async () => {
    const row = await store.latest();
    const base = {
      simulation,
      minimum_reports: minimum,
      scope: "opt-in installation reports, not unique people",
      report_count: row?.count ?? 0,
      week: row?.week ?? null,
    };
    if (!row || row.count < minimum)
      return {
        ...base,
        status: "insufficient_data",
        histograms: null,
        uncertainty: null,
      };
    // Pointwise normal approximation for independently sampled Laplace noise; excludes sampling/classification bias.
    const halfWidth = 1.96 * 6 * Math.sqrt(2 / row.count);
    return {
      ...base,
      status: "published",
      histograms: Object.fromEntries(
        GROUPS.map((group, gi) => [
          group,
          row.sums.slice(gi * 8, gi * 8 + 8).map((v) => v / row.count),
        ]),
      ),
      uncertainty: {
        pointwise_95_half_width: halfWidth,
        method:
          "normal approximation; DP noise only; not simultaneous intervals",
        epsilon_per_report: 1,
        laplace_scale: 6,
      },
    };
  };
  app.get("/health", async () => ({
    status: "ok",
    service: "omni-collector",
    simulation,
  }));
  app.get("/api/v1/global", snapshot);
  app.get("/api/simulation", async () => {
    if (!simulation) return { status: "disabled", simulation: false };
    const filename =
      options.simulationReport ?? process.env.OMNI_SIMULATION_REPORT;
    if (!filename) return { status: "not_run", simulation: true };
    try {
      return JSON.parse(await readFile(filename, "utf8"));
    } catch {
      return { status: "not_run", simulation: true };
    }
  });
  app.post(
    "/api/v1/analytics",
    { schema: { body: reportSchema } },
    async (request, reply) => {
      const current = isoWeek();
      const previous = isoWeek(new Date(Date.now() - 7 * 86400000));
      if (!simulation && ![current, previous].includes(request.body.week))
        return reply
          .code(400)
          .send({ error: "report_week_outside_acceptance_window" });
      const result = await store.add(request.body);
      if (result === "conflict")
        return reply.code(409).send({ error: "report_id_conflict" });
      if (result === "accepted") {
        const update = await snapshot();
        if (update.status === "published") {
          const text = JSON.stringify({ type: "global.updated", data: update });
          for (const socket of sockets) {
            if (socket.readyState === 1 && socket.bufferedAmount < 65536)
              socket.send(text);
            else if (socket.bufferedAmount >= 65536)
              socket.close(1013, "Slow consumer");
          }
        }
      }
      return reply
        .code(result === "accepted" ? 202 : 200)
        .send({ status: result, report_id: request.body.report_id });
    },
  );
  app.get("/api/v1/events", { websocket: true }, (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
    snapshot()
      .then((data) => {
        if (socket.readyState === 1)
          socket.send(JSON.stringify({ type: "global.snapshot", data }));
      })
      .catch(() => socket.close(1011));
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = error.validation
      ? 400
      : error.statusCode === 429
        ? 429
        : error.statusCode === 413
          ? 413
          : 500;
    reply
      .code(code)
      .send({
        error:
          code === 400
            ? "invalid_analytics_schema"
            : code === 429
              ? "rate_limited"
              : code === 413
                ? "report_too_large"
                : "collector_unavailable",
      });
  });
  app.addHook("onClose", async () => {
    for (const socket of sockets) socket.close();
    await store.close();
  });
  return app;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = await createServer();
  const host = process.env.OMNI_COLLECTOR_HOST ?? "127.0.0.1";
  const port = Number(process.env.OMNI_COLLECTOR_PORT ?? 3008);
  await app.listen({ host, port });
  process.stdout.write(`OMNI collector listening on ${host}:${port}\n`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
