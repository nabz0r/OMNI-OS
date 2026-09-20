import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, isoWeek } from "../src/server.mjs";
import { SqliteStore } from "../src/store.mjs";

const report = () => ({
  schema_version: 1,
  report_id: randomUUID(),
  week: isoWeek(),
  epsilon: 1,
  histograms: {
    topics: [-3, 1, 2, 0, 1, 0, 0, 0],
    latency: Array(8).fill(0),
    tokens: Array(8).fill(0),
  },
});
async function server(t, options = {}) {
  const app = await createServer({
    store: new SqliteStore(),
    simulation: true,
    minimum: 2,
    ...options,
  });
  t.after(() => app.close());
  return app;
}

test("rejects raw text, unknown keys, missing bins, and modified privacy budgets", async (t) => {
  const app = await server(t);
  const bad = [
    { ...report(), prompt: "SECRET_CANARY" },
    { ...report(), epsilon: 99 },
    { ...report(), histograms: { ...report().histograms, topics: [1] } },
    { ...report(), histograms: { ...report().histograms, hidden: "secret" } },
  ];
  for (const payload of bad) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analytics",
      payload,
    });
    assert.equal(response.statusCode, 400);
    assert.ok(!response.body.includes("SECRET_CANARY"));
  }
});
test("deduplicates concurrent retries and rejects changed content under an old id", async (t) => {
  const app = await server(t);
  const payload = report();
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      app.inject({ method: "POST", url: "/api/v1/analytics", payload }),
    ),
  );
  assert.equal(results.filter((r) => r.statusCode === 202).length, 1);
  assert.equal((await app.inject("/api/v1/global")).json().report_count, 1);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/analytics",
    payload: {
      ...payload,
      histograms: { ...payload.histograms, topics: Array(8).fill(42) },
    },
  });
  assert.equal(response.statusCode, 409);
});
test("suppresses small cohorts; preserves negative noised values and reports uncertainty", async (t) => {
  const app = await server(t);
  await app.inject({
    method: "POST",
    url: "/api/v1/analytics",
    payload: report(),
  });
  assert.equal(
    (await app.inject("/api/v1/global")).json().status,
    "insufficient_data",
  );
  await app.inject({
    method: "POST",
    url: "/api/v1/analytics",
    payload: report(),
  });
  const data = (await app.inject("/api/v1/global")).json();
  assert.equal(data.histograms.topics[0], -3);
  assert.ok(data.uncertainty.pointwise_95_half_width > 0);
  assert.equal(data.simulation, true);
});
test("production cannot silently lower the publication threshold", async () => {
  await assert.rejects(
    createServer({ simulation: false, minimum: 5 }),
    /threshold/,
  );
});
test("deduplication and aggregates survive a collector restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omni-collector-"));
  const file = join(dir, "analytics.sqlite");
  const payload = report();
  try {
    const first = new SqliteStore(file);
    assert.equal(await first.add(payload), "accepted");
    await first.close();
    const second = new SqliteStore(file);
    assert.equal(await second.add(payload), "duplicate");
    assert.equal((await second.latest()).count, 1);
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("ISO weeks handle year boundaries", () => {
  assert.equal(isoWeek(new Date("2021-01-01")), "2020-W53");
  assert.equal(isoWeek(new Date("2026-09-21")), "2026-W39");
});

test("simulation refuses inherited Redis settings before making a connection", async () => {
  const original = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://127.0.0.1:1";
  try {
    await assert.rejects(
      createServer({ simulation: true, minimum: 2 }),
      /Simulation requires an isolated/,
    );
  } finally {
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  }
});

test("production cannot expose the local simulation evidence endpoint", async (t) => {
  const app = await server(t, {
    simulation: false,
    minimum: 10000,
    simulationReport: "/not/read/in/production",
  });
  assert.deepEqual((await app.inject("/api/simulation")).json(), {
    status: "disabled",
    simulation: false,
  });
});
