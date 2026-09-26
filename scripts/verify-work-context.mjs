#!/usr/bin/env node
// Disposable synthetic acceptance, not a benchmark of commercial provider latency.
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir, cpus, platform, arch } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { send } from "../examples/work-clients/javascript.mjs";
const binary = process.argv[2];
if (!binary)
  throw new Error(
    "Usage: node scripts/verify-work-context.mjs /absolute/path/to/omni-core [report.json]",
  );
const output = resolve(
  process.argv[3] ||
    "artifacts/professional-implementation/controlled-loop.json",
);
const root = resolve(import.meta.dirname, "..");
const preference =
  "SIM_CANARY_WORK prefers EUR for the synthetic Atlas project.";
const arrivals = [];
const server = http.createServer(async (req, res) => {
  let content = "";
  for await (const chunk of req) {
    content += chunk;
    if (content.length > 1048576) {
      res.writeHead(413);
      res.end();
      return;
    }
  }
  const body = JSON.parse(content);
  arrivals.push(body);
  const extracting = !!body.response_format;
  const answer = extracting
    ? JSON.stringify({ memories: [{ content: preference }] })
    : "Synthetic provider reply";
  if (!extracting) await new Promise((resolve) => setTimeout(resolve, 25));
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content: answer } }],
      usage: { prompt_tokens: 32, completion_tokens: 4, total_tokens: 36 },
    }),
  );
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const destination = `http://127.0.0.1:${server.address().port}/v1`;
const directory = await mkdtemp(join(tmpdir(), "omni-work-verification-"));
const token = randomBytes(32).toString("hex"),
  legacy = randomBytes(32).toString("hex");
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^(OMNI_|OPENAI_|ANTHROPIC_)/.test(key),
  ),
);
const child = spawn(resolve(binary), [], {
  cwd: root,
  env: {
    ...env,
    OMNI_DATA_DIR: directory,
    OMNI_KEY_STORAGE: "file",
    OMNI_LOCAL_TOKEN: token,
    OMNI_AGENT_TOKEN: legacy,
    OMNI_CORE_PORT: "0",
    OMNI_LLM_BASE: destination,
    OMNI_LLM_MODEL: "omni-synthetic",
    OMNI_EXTRACTOR_BASE: destination,
    OMNI_UPSTREAM_ALLOWLIST: destination,
    OMNI_SIMULATION: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let diagnostic = "";
child.stderr.on("data", (chunk) => (diagnostic += chunk));
const base = await new Promise((resolve, reject) => {
  let text = "";
  const timer = setTimeout(
    () => reject(new Error("Core startup timed out")),
    20000,
  );
  child.stdout.on("data", (chunk) => {
    text += chunk;
    const found = text.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
    if (found) {
      clearTimeout(timer);
      resolve(found[1]);
    }
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`Core exited ${code}: ${diagnostic}`));
  });
});
const checks = {};
const check = (name, value) => {
  assert.ok(value, name);
  checks[name] = true;
};
async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const value = response.status === 204 ? null : await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(value)}`);
  return value;
}
async function python(config) {
  const p = spawn(
    process.env.PYTHON || "python3",
    [join(root, "examples/work-clients/python.py")],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let out = "",
    error = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (error += d));
  p.stdin.end(JSON.stringify(config));
  const [code] = await once(p, "exit");
  assert.equal(code, 0, error);
  return JSON.parse(out);
}
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    min_us: sorted[0],
    p50_us: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95_us: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max_us: sorted.at(-1),
  };
};
try {
  await api("/api/work", {
    label: "Synthetic single-owner work instance",
    acknowledge_single_owner: true,
  });
  const imported = await api("/api/capture", {
    source: "other_export_review",
    content: JSON.stringify({
      format: "omni-reviewed-conversation-v1",
      provider: "Other",
      title: "Synthetic work preference",
      messages: [{ role: "user", text: preference }],
    }),
  });
  const memory = imported.memories[0];
  check(
    "import_creates_proposal_only",
    memory.status === "proposed" &&
      (await api("/api/state")).grants.length === 0,
  );
  await api(`/api/memories/${memory.id}`, { status: "confirmed" }, "PATCH");
  const clients = [];
  for (const [name, execute] of [
    ["JavaScript fetch reference", send],
    ["Python urllib reference", python],
  ]) {
    const client = await api("/api/work/clients", {
      label: name,
      destinations: [destination],
      expires_in_seconds: 3600,
    });
    const grant = await api("/api/grants", {
      destination,
      scope: [memory.id],
      client_id: client.id,
    });
    const config = { base, token: client.token, grant: grant.id };
    const before = arrivals.length;
    const reply = await execute(config);
    check(
      `${name}_delivered_once`,
      reply.status === 200 && arrivals.length === before + 1,
    );
    check(
      `${name}_selected_context_received`,
      JSON.stringify(arrivals.at(-1)).includes(preference),
    );
    const receipt = (await api("/api/state")).receipts.find(
      (r) => r.id === reply.receipt,
    );
    check(
      `${name}_receipt_verified`,
      receipt?.status === "sent" &&
        receipt.destination === destination &&
        receipt.memory_ids.length === 1 &&
        receipt.memory_ids[0] === memory.id,
    );
    clients.push({ client, grant, config, execute });
  }
  const before = arrivals.length;
  check(
    "foreign_client_grant_denied",
    (await send({ ...clients[0].config, grant: clients[1].grant.id }))
      .status === 403,
  );
  check(
    "legacy_work_token_denied",
    (await send({ base, token: legacy })).status === 401,
  );
  check("denied_traffic_never_arrived", arrivals.length === before);
  // Sequential warm observations, identical bounded payloads, synthetic 25 ms upstream delay.
  const endToEnd = [];
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    assert.equal((await send(clients[0].config)).status, 200);
    endToEnd.push(Math.round((performance.now() - start) * 1000));
  }
  const work = await api("/api/work");
  const measured = work.requests
    .filter((r) => r.principal_id === clients[0].client.id)
    .slice(0, 40);
  assert.equal(measured.length, 40);
  for (const { client, grant, config, execute } of clients) {
    const before = arrivals.length;
    await api(`/api/grants/${grant.id}`, undefined, "DELETE");
    check(
      `${client.id}_revoked_grant_denied`,
      (await execute(config)).status === 403,
    );
    await api(`/api/work/clients/${client.id}`, undefined, "DELETE");
    check(
      `${client.id}_revoked_client_denied`,
      (await execute(config)).status === 401,
    );
    check(`${client.id}_revocations_zero_egress`, arrivals.length === before);
  }
  const report = {
    status: "passed",
    created_at: new Date().toISOString(),
    source_revision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    source_dirty: !!execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    hardware: {
      cpu: cpus()[0]?.model,
      platform: platform(),
      arch: arch(),
      node: process.version,
      python: execFileSync(process.env.PYTHON || "python3", ["--version"], {
        encoding: "utf8",
      }).trim(),
    },
    scope:
      "Actual core process and two independent local HTTP reference clients; synthetic extraction and response provider only. No commercial provider, third-party UI, SLA or physical-device claim.",
    checks,
    provider_arrivals: arrivals.length,
    benchmark: {
      profile: "debug unless the supplied binary was built otherwise",
      concurrency: 1,
      warm_samples: 40,
      prompt: "fixed synthetic project budget",
      synthetic_upstream_delay_ms: 25,
      preflight: stats(measured.map((r) => r.preflight_us)),
      policy: stats(measured.map((r) => r.policy_us)),
      end_to_end: stats(endToEnd),
      interpretation:
        "Policy is a subset of preflight. End-to-end includes local HTTP, serialization, persistence, the synthetic provider delay and response handling. Do not subtract percentiles or infer production latency.",
    },
  };
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `Passed ${Object.keys(checks).length} controlled-loop checks. Evidence: ${output}`,
  );
} finally {
  child.kill("SIGINT");
  await once(child, "exit");
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
