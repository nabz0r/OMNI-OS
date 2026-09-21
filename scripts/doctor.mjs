import { execFile } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { dependenciesCurrent } from "./dependency-stamp.mjs";

const execute = promisify(execFile);

export function localModelURL(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Only a credential-free loopback endpoint can be inspected.",
    );
  return new URL("/api/tags", url.origin).href;
}

export function portStatus(port) {
  return new Promise((resolveStatus) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    let finished = false;
    const finish = (status) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolveStatus(status);
    };
    socket.setTimeout(500, () => finish("unknown"));
    socket.once("connect", () => finish("in_use"));
    socket.once("error", (error) =>
      finish(error.code === "ECONNREFUSED" ? "available" : "unknown"),
    );
  });
}

async function boundedJSON(response) {
  if (!response.ok || !response.body)
    throw new Error("Local model service unavailable.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024 * 1024)
        throw new Error("Local model catalog is too large.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function inspectInstallation({
  directory = resolve(import.meta.dirname, ".."),
  environment = process.env,
  nodeVersion = process.versions.node,
  platform = process.platform,
  simulation = false,
  runCommand = execute,
  inspectPort = portStatus,
  fetchLocal = fetch,
  inspectDependencies = dependenciesCurrent,
} = {}) {
  const checks = [];
  const add = (name, status, detail, next_step) =>
    checks.push({ name, status, detail, ...(next_step ? { next_step } : {}) });
  const [major, minor] = nodeVersion.split(".").map(Number);
  const nodeOK = major > 22 || (major === 22 && minor >= 13);
  add(
    "Node.js",
    nodeOK ? "ok" : "error",
    nodeVersion,
    nodeOK ? undefined : "Install Node.js 22.13 or later and npm, then retry.",
  );
  await Promise.all(
    [
      ["npm", ["--version"], "Install npm with Node.js."],
      [
        "cargo",
        ["--version"],
        "Run ./scripts/bootstrap.sh to install the minimal Rust toolchain.",
      ],
      [
        "rustc",
        ["--version"],
        "Run ./scripts/bootstrap.sh to install the minimal Rust toolchain.",
      ],
      [
        "cc",
        ["--version"],
        platform === "darwin"
          ? "Install Command Line Tools with xcode-select --install."
          : "Install your platform's C/C++ compiler toolchain.",
      ],
      [
        "make",
        ["--version"],
        "Install make with your platform's development tools.",
      ],
      [
        "perl",
        ["-e", "print $^V"],
        "Install Perl for the bundled cryptography build.",
      ],
    ].map(async ([command, args, next]) => {
      try {
        const result = await runCommand(command, args, {
          timeout: 3000,
          maxBuffer: 16384,
          windowsHide: true,
        });
        const first = result.stdout.trim().split(/\r?\n/)[0] || "Available";
        add(
          command,
          "ok",
          first.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 150),
        );
      } catch {
        add(command, "error", "Not available", next);
      }
    }),
  );
  const deps = await inspectDependencies(directory);
  add(
    "JavaScript dependencies",
    deps ? "ok" : "warning",
    deps ? "Match the current lockfile" : "Installation or refresh required",
    deps ? undefined : "The next launch will run npm ci before building.",
  );
  for (const port of [3006, 3007, 3008, ...(simulation ? [4101, 4102] : [])]) {
    const status = await inspectPort(port);
    add(
      `Port ${port}`,
      status === "available" ? "ok" : "warning",
      status === "available"
        ? "Available now"
        : status === "in_use"
          ? "Already in use"
          : "Could not determine availability",
      status === "in_use"
        ? "Keep the existing session, or stop it yourself before starting another. No process was stopped."
        : undefined,
    );
  }
  try {
    const endpoint = localModelURL(
      environment.OMNI_EXTRACTOR_BASE || "http://127.0.0.1:11434/v1",
    );
    const response = await fetchLocal(endpoint, {
      signal: AbortSignal.timeout(2500),
      redirect: "error",
    });
    const catalog = await boundedJSON(response);
    if (!Array.isArray(catalog.models))
      throw new Error("Invalid local model catalog.");
    const names = [
      ...new Set(
        catalog.models
          .slice(0, 1000)
          .map((entry) => entry.name)
          .filter(
            (name) =>
              typeof name === "string" &&
              name.length <= 200 &&
              !/[\u0000-\u001f\u007f]/.test(name),
          ),
      ),
    ];
    const expected = environment.OMNI_EXTRACTOR_MODEL || "qwen3:0.6b";
    const installed = names.includes(expected);
    add(
      "Local models",
      installed ? "ok" : "warning",
      names.length
        ? `${names.length} installed: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ", …" : ""}`
        : "Ollama is running with no installed models",
      installed
        ? undefined
        : "Select an installed extraction model in Settings, or install one with Ollama before capturing text.",
    );
  } catch {
    add(
      "Local models",
      "warning",
      "A safe local Ollama catalog could not be read",
      "Start Ollama and install a model. Remote endpoints, credentials and redirects are never used by this diagnostic.",
    );
  }
  return {
    read_only: true,
    ready: checks.every((check) => check.status === "ok"),
    checks,
  };
}

export function formatDiagnosis(result) {
  const lines = ["OMNI startup check — read only", ""];
  for (const check of result.checks) {
    lines.push(
      `${check.status === "ok" ? "OK" : check.status === "error" ? "MISSING" : "CHECK"}  ${check.name}: ${check.detail}`,
    );
    if (check.next_step) lines.push(`       ${check.next_step}`);
  }
  lines.push(
    "",
    "No packages installed, services started, keys read or processes stopped.",
  );
  return `${lines.join("\n")}\n`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await inspectInstallation({
      simulation: process.argv.includes("--simulate"),
    });
    process.stdout.write(
      process.argv.includes("--json")
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatDiagnosis(result),
    );
    process.exitCode = result.checks.some((check) => check.status === "error")
      ? 1
      : 0;
  } catch {
    process.stderr.write(
      "The startup diagnostic could not finish. Check Node.js and the project files, then retry.\n",
    );
    process.exitCode = 1;
  }
}
