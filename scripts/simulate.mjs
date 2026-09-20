import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { startMockProvider } from "./mock-providers.mjs";
import { createServer } from "../services/collector/src/server.mjs";
import { SqliteStore } from "../services/collector/src/store.mjs";

const root = resolve(import.meta.dirname, "..");
const buildDir = execFileSync(
  process.execPath,
  [resolve(root, "scripts/build-dir.mjs")],
  { encoding: "utf8" },
).trim();
const existing = process.env.OMNI_SIM_USE_EXISTING === "1";
const clientsCount = Number(process.env.OMNI_SIM_CLIENTS ?? 6);
if (!Number.isInteger(clientsCount) || clientsCount < 6 || clientsCount > 16)
  throw new Error("Simulation supports 6–16 clients.");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const directory = resolve(root, ".omni", "simulations", runId);
const latestFile = resolve(root, ".omni", "simulation-latest.json");
await mkdir(directory, { recursive: true, mode: 0o700 });
const children = [];
const providers = [];
let collector;
const report = {
  simulation: true,
  status: "running",
  run_id: runId,
  clients: clientsCount,
  started_at: new Date().toISOString(),
  providers: [
    { name: "Local lab", kind: "local", url: "http://127.0.0.1:4101" },
    {
      name: "SaaS lab",
      kind: "saas-simulated-on-loopback",
      url: "http://127.0.0.1:4102",
    },
  ],
  assertions: [],
  events: [],
  summary: { requests: 0, accepted_reports: 0, blocked_requests: 0 },
  vpn: null,
};
const save = async () => {
  await writeFile(latestFile, JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile(
    resolve(directory, "report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
};
const check = (name, pass, detail) => {
  report.assertions.push({ name, passed: Boolean(pass), detail });
  assert.ok(pass, `${name}: ${detail ?? ""}`);
};
const event = (client, type, detail) =>
  report.events.push({ at: new Date().toISOString(), client, type, detail });

function start(command, args, env, label) {
  const log = createWriteStream(resolve(directory, `${label}.log`), {
    mode: 0o600,
  });
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.on("error", (error) => {
    child.spawnError = error;
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
  return child;
}
async function ready(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child?.spawnError) throw child.spawnError;
    if (child?.exitCode !== null && child?.exitCode !== undefined)
      throw new Error(`Child exited before ${url}; inspect ${directory}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function call(base, token, path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, ok: response.ok, data };
}
async function clean() {
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => {
            child.once("exit", resolve);
            setTimeout(() => {
              if (child.exitCode === null) child.kill("SIGKILL");
              resolve();
            }, 3000).unref();
          }),
    ),
  );
  if (collector) await collector.close();
  for (const provider of providers) await provider.close();
}

try {
  await save();
  if (!existing) {
    providers.push(
      await startMockProvider({ port: 4101, name: "Local lab", kind: "local" }),
    );
    providers.push(
      await startMockProvider({
        port: 4102,
        name: "SaaS lab",
        kind: "saas-simulated-on-loopback",
      }),
    );
    collector = await createServer({
      store: new SqliteStore(resolve(directory, "collector.sqlite")),
      simulation: true,
      minimum: 2,
      rateLimit: 1000,
    });
    await collector.listen({ host: "127.0.0.1", port: 0 });
  }
  const collectorUrl = existing
    ? "http://127.0.0.1:3008"
    : `http://127.0.0.1:${collector.server.address().port}`;
  const collectorHealth = await (
    await fetch(`${collectorUrl}/health`, { signal: AbortSignal.timeout(5000) })
  ).json();
  check(
    "collector explicitly runs in isolated simulation mode",
    collectorHealth.simulation === true,
  );
  for (let i = 0; i < clientsCount; i++) {
    const id = `client-${i + 1}`;
    const token = randomBytes(32).toString("hex");
    const agentToken = randomBytes(32).toString("hex");
    const port = 4201 + i;
    const base = `http://127.0.0.1:${port}`;
    const provider = report.providers[i % report.providers.length];
    const dataDir = resolve(directory, id);
    const child = start(
      resolve(buildDir, "debug/omni-core"),
      [],
      {
        OMNI_CORE_PORT: String(port),
        OMNI_DATA_DIR: dataDir,
        OMNI_KEY_STORAGE: "file",
        OMNI_LOCAL_TOKEN: token,
        OMNI_AGENT_TOKEN: agentToken,
        OMNI_SIMULATION: "1",
        OMNI_ANALYTICS_OPT_IN: "true",
        OMNI_LLM_BASE: `${provider.url}/v1`,
        OMNI_LLM_MODEL: "omni-synthetic",
        OMNI_ANTHROPIC_BASE: `${provider.url}/v1`,
        OMNI_ANALYTICS_URL: `${collectorUrl}/api/v1/analytics`,
        OMNI_UPSTREAM_ALLOWLIST: `${provider.url}/v1`,
        OMNI_SOCKS_PROXY: "",
        OMNI_VPN_REQUIRED: "false",
        OMNI_LLM_API_KEY: "",
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
      },
      id,
    );
    await ready(`${base}/health`, child);
    const unauthorized = await call(base, "wrong-token", "/api/state");
    check(`${id}: unauthorized access rejected`, unauthorized.status === 401);
    const memory = await call(base, token, "/api/memories", "POST", {
      content: `SIM_CANARY_CLIENT_${i + 1} prefers concise explanations; fictional project Aurora uses Rust.`,
      status: "confirmed",
      source: "simulation",
    });
    check(
      `${id}: encrypted memory created`,
      memory.ok,
      JSON.stringify(memory.data),
    );
    const memoryId = memory.data.id ?? memory.data.memory?.id;
    assert.ok(memoryId, "memory id present");
    const grant = await call(base, token, "/api/grants", "POST", {
      destination: `${provider.url}/v1`,
      scope: [memoryId],
      expires_in_seconds: 3600,
    });
    check(`${id}: scoped grant created`, grant.ok, JSON.stringify(grant.data));
    const grantId = grant.data.id ?? grant.data.grant?.id;
    assert.ok(grantId);
    const privilegeEscalation = await call(
      base,
      agentToken,
      "/api/grants",
      "POST",
      {
        destination: `${provider.url}/v1`,
        scope: ["*"],
        expires_in_seconds: 3600,
      },
    );
    check(
      `${id}: agent cannot grant itself authority`,
      [401, 403].includes(privilegeEscalation.status),
    );
    for (let turn = 0; turn < 2; turn++) {
      const answer = await call(base, token, "/api/chat", "POST", {
        message: `Synthetic request ${turn}: help with the fictional project plan.`,
        grant_id: grantId,
        model: "omni-synthetic",
      });
      check(
        `${id}: provider exchange ${turn + 1}`,
        answer.ok,
        JSON.stringify(answer.data),
      );
      check(
        `${id}: authorized context reaches provider ${turn + 1}`,
        answer.data.reply?.includes(
          "Authorized project context was available.",
        ),
      );
      report.summary.requests++;
      event(id, "interaction", `${provider.name}: synthetic task ${turn + 1}`);
    }
    for (const [path, ending] of [
      ["/v1/chat/completions", "data: [DONE]"],
      ["/v1/messages", "event: message_stop"],
    ]) {
      const stream = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "x-omni-grant": grantId,
        },
        body: JSON.stringify({
          model: "omni-synthetic",
          messages: [{ role: "user", content: "Synthetic streamed task." }],
          stream: true,
          max_tokens: 64,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const chunks = await stream.text();
      check(
        `${id}: ${path} preserves event stream`,
        stream.ok &&
          stream.headers.get("content-type")?.includes("text/event-stream") &&
          chunks.includes(ending),
      );
      check(
        `${id}: ${path} produces a disclosure receipt`,
        Boolean(stream.headers.get("x-omni-receipt")),
      );
      report.summary.requests++;
    }
    const unscoped = await call(base, token, "/api/chat", "POST", {
      message: "Synthetic task without permission.",
    });
    check(
      `${id}: no grant means no memory disclosure`,
      unscoped.ok &&
        unscoped.data.reply?.includes("No private memory was supplied.") &&
        unscoped.data.receipt_id === null,
    );
    report.summary.requests++;
    const revoked = await call(base, token, `/api/grants/${grantId}`, "DELETE");
    check(`${id}: grant revoked`, revoked.ok);
    const blocked = await call(base, token, "/api/chat", "POST", {
      message: "Synthetic request after revocation.",
      grant_id: grantId,
      model: "omni-synthetic",
    });
    check(
      `${id}: revoked grant blocked`,
      [400, 401, 403, 404].includes(blocked.status),
      JSON.stringify(blocked.data),
    );
    report.summary.blocked_requests++;
    const prepared = await call(
      base,
      token,
      "/api/analytics/prepare",
      "POST",
      {},
    );
    check(
      `${id}: differential privacy report prepared`,
      prepared.ok,
      JSON.stringify(prepared.data),
    );
    const payload = prepared.data.report ?? prepared.data;
    check(
      `${id}: analytics contains no source text`,
      !JSON.stringify(payload).includes("SIM_CANARY") &&
        !JSON.stringify(payload).includes("Aurora"),
    );
    const submitted = await call(
      base,
      token,
      "/api/analytics/send",
      "POST",
      {},
    );
    check(
      `${id}: Rust privacy sender submits report`,
      submitted.ok,
      JSON.stringify(submitted.data),
    );
    report.summary.accepted_reports++;
    const retried = await call(
      base,
      token,
      "/api/analytics/prepare",
      "POST",
      {},
    );
    const repeated = retried.data.report ?? retried.data;
    check(
      `${id}: report retries reuse original noise`,
      JSON.stringify(payload) === JSON.stringify(repeated),
    );
    const duplicate = await fetch(`${collectorUrl}/api/v1/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    check(`${id}: collector deduplicates retries`, duplicate.status === 200);
    const deleted = await call(
      base,
      token,
      `/api/memories/${memoryId}`,
      "DELETE",
    );
    check(`${id}: memory deletion succeeds`, deleted.ok);
    event(
      id,
      "privacy",
      "Grant revoked, source memory removed, report kept as an already-noised release.",
    );
    await save();
  }
  const leakAttempt = await fetch(`${collectorUrl}/api/v1/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "SIM_CANARY_MUST_NOT_LEAVE" }),
  });
  check("collector rejects raw payloads", leakAttempt.status === 400);
  const outputFile = resolve(directory, "vpn-report.json");
  const vpn = start(
    resolve(buildDir, "debug/omni-vpn"),
    [
      "simulate",
      "--clients",
      String(clientsCount),
      "--rounds",
      "3",
      "--output",
      outputFile,
      "--provider-urls",
      "http://127.0.0.1:4101,http://127.0.0.1:4102",
    ],
    {},
    "vpn",
  );
  const vpnExit = await new Promise((resolve, reject) => {
    vpn.once("error", reject);
    vpn.once("exit", (code) => resolve(code));
  });
  check("WireGuard multi-client simulation exits successfully", vpnExit === 0);
  report.vpn = JSON.parse(await readFile(outputFile, "utf8"));
  check(
    "encrypted VPN, knocking and key rotation assertions pass",
    report.vpn.passed === true,
  );
  report.global = await (await fetch(`${collectorUrl}/api/v1/global`)).json();
  check(
    "only noised installation reports are aggregated",
    report.global.report_count >= clientsCount && report.global.simulation,
  );
  if (existing) {
    const token = process.env.OMNI_LOCAL_TOKEN;
    const prior = await call("http://127.0.0.1:3007", token, "/api/state");
    check(
      "viewer is the authenticated simulation instance",
      prior.ok && prior.data.stats?.simulation === true,
    );
    const existingContents = new Set(
      prior.data.memories.map((memory) => memory.content),
    );
    for (const [content, status] of [
      [
        "Synthetic identity: Alex is building the fictional Aurora project.",
        "confirmed",
      ],
      [
        "Synthetic preference: concise explanations with concrete examples.",
        "confirmed",
      ],
      [
        "Synthetic project: Aurora uses Rust and local-first storage.",
        "confirmed",
      ],
      [
        "Synthetic boundary: never share fictional customer identities.",
        "confirmed",
      ],
      [
        "Synthetic observation: quieter visual effects may be preferable.",
        "proposed",
      ],
    ])
      if (!existingContents.has(content))
        await call("http://127.0.0.1:3007", token, "/api/memories", "POST", {
          content,
          status,
          source: "simulation",
        });
  }
  report.status = "passed";
  report.completed_at = new Date().toISOString();
  await save();
  process.stdout.write(
    `Simulation passed: ${clientsCount} isolated clients, ${report.summary.requests} proxy interactions, ${report.summary.accepted_reports} private reports.\nReport: ${latestFile}\n`,
  );
} catch (error) {
  report.status = "failed";
  report.error = String(error.message);
  report.completed_at = new Date().toISOString();
  await save();
  process.stderr.write(
    `Simulation failed: ${error.message}\nReport: ${latestFile}\n`,
  );
  process.exitCode = 1;
} finally {
  await clean();
}
