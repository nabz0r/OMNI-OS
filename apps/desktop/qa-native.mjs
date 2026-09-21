import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import net from "node:net";
import assert from "node:assert/strict";
import { startMockProvider } from "../../scripts/mock-providers.mjs";

// This is browser transport QA, not a native binary or OS secure-store test.
// Only Tauri invocation and export presentation are mocked. Every API response
// comes unchanged from a real, isolated Rust core and encrypted temporary vault.
const root = resolve(import.meta.dirname, "../..");
const directory = await mkdtemp(join(tmpdir(), "omni-native-transport-"));
const artifacts = resolve(root, "apps/desktop/artifacts/native-transport");
await mkdir(artifacts, { recursive: true });
const build = execFileSync(
  process.execPath,
  [resolve(root, "scripts/build-dir.mjs")],
  { encoding: "utf8" },
).trim();
const owner = randomBytes(32).toString("hex");
const agent = randomBytes(32).toString("hex");
const providerKey = `QA_NATIVE_CREDENTIAL_${randomBytes(12).toString("hex")}`;
const privateMemory =
  "SIM_CANARY_NATIVE_TRANSPORT prefers a private daily plan.";
const privatePrompt =
  "QA_NATIVE_PRIVATE_PROMPT Help me organize a small project.";
const reserve = net.createServer();
await new Promise((ready) => reserve.listen(0, "127.0.0.1", ready));
const port = reserve.address().port;
await new Promise((done) => reserve.close(done));
const base = `http://127.0.0.1:${port}`;
const provider = await startMockProvider({
  port: 0,
  name: "Native transport fixture",
  kind: "local",
});
const child = spawn(
  resolve(
    build,
    `debug/omni-core${process.platform === "win32" ? ".exe" : ""}`,
  ),
  [],
  {
    stdio: "ignore",
    env: {
      ...process.env,
      OMNI_DATA_DIR: directory,
      OMNI_KEY_STORAGE: "file",
      OMNI_CORE_PORT: String(port),
      OMNI_LOCAL_TOKEN: owner,
      OMNI_AGENT_TOKEN: agent,
    OMNI_PAIRING_SECRET: randomBytes(32).toString("hex"),
      OMNI_LLM_BASE: `${provider.url}/v1`,
      OMNI_LLM_MODEL: "omni-synthetic",
      OMNI_LLM_API_KEY: providerKey,
      OMNI_EXTRACTOR_BASE: `${provider.url}/v1`,
      OMNI_EXTRACTOR_MODEL: "omni-synthetic",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      OMNI_ANTHROPIC_BASE: "https://api.anthropic.com/v1",
      OMNI_ANALYTICS_URL: `${provider.url}/api/v1/analytics`,
      OMNI_SIMULATION: "0",
      OMNI_ANALYTICS_OPT_IN: "false",
      OMNI_SOCKS_PROXY: "",
      OMNI_VPN_REQUIRED: "false",
      OMNI_UPSTREAM_ALLOWLIST: `${provider.url}/v1`,
    },
  },
);
let startupError;
child.once("error", () => {
  startupError = new Error(
    "Build the Rust workspace before running native transport QA.",
  );
});
let browser, page;
const errors = [];
const forbiddenFetches = [];
const calls = [];
const exports = [];
let browserDownloads = 0;

async function until(check, description) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (await check()) return;
    await new Promise((ready) => setTimeout(ready, 100));
  }
  throw new Error(description);
}

async function api(path) {
  const response = await fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${owner}` },
  });
  assert.ok(response.ok, `Fixture API returned ${response.status}`);
  return response.json();
}

function assertMetadataOnly(contents) {
  for (const value of [
    owner,
    agent,
    providerKey,
    privateMemory,
    privatePrompt,
  ]) {
    assert.equal(
      contents.includes(value),
      false,
      "Native exports must exclude credentials, memories and prompt bodies",
    );
  }
  const forbidden = new Set([
    "prompt",
    "reply",
    "messages",
    "content",
    "body",
    "api_key",
    "authorization",
    "local_token",
    "agent_token",
  ]);
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert.equal(
        forbidden.has(key.toLowerCase()),
        false,
        `Unexpected private export field: ${key}`,
      );
      walk(item);
    }
  };
  if (contents.startsWith("{")) walk(JSON.parse(contents));
}

async function nativePage(platform) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  const current = await context.newPage();
  current.setDefaultTimeout(15000);
  current.on("pageerror", (error) => errors.push(error.message));
  current.on("download", () => browserDownloads++);
  await current.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.includes("/api/") ||
      url.pathname === "/health" ||
      ["3007", "3008", String(port)].includes(url.port)
    ) {
      forbiddenFetches.push({ platform, path: url.pathname });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await current.exposeFunction(
    "__omniNativeInvoke",
    async (command, args = {}) => {
      calls.push({ platform, command, path: args.path, method: args.method });
      if (command === "native_session") {
        return {
          token: owner,
          mode: "embedded",
          core_url: "in-process",
          collector_url: null,
          platform,
        };
      }
      if (command === "core_request") {
        assert.ok(
          typeof args.path === "string" &&
            args.path.startsWith("/") &&
            !args.path.startsWith("//"),
          "The transport must select a local API path",
        );
        assert.ok(["GET", "POST", "PATCH", "DELETE"].includes(args.method));
        const response = await fetch(`${base}${args.path}`, {
          method: args.method,
          headers: {
            authorization: `Bearer ${args.token}`,
            "content-type": "application/json",
          },
          body: args.body ?? undefined,
        });
        return { status: response.status, body: await response.text() };
      }
      if (command === "save_metadata") {
        assert.match(args.name, /^omni-[a-zA-Z0-9_.-]+\.(json|csv)$/);
        assert.ok(["application/json", "text/csv"].includes(args.mime));
        assert.ok(Buffer.byteLength(args.contents, "utf8") <= 2 * 1024 * 1024);
        assertMetadataOnly(args.contents);
        exports.push({ platform, ...args });
        return "Choose a destination in the system share sheet.";
      }
      throw new Error(`Unexpected native command: ${command}`);
    },
  );
  await current.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: (command, args) => window.__omniNativeInvoke(command, args),
    };
    if (!sessionStorage.getItem("qa.native.seeded")) {
      sessionStorage.setItem("omni.token", "obsolete-browser-token");
      sessionStorage.setItem("qa.native.seeded", "true");
    }
  });
  return current;
}

try {
  await until(async () => {
    if (startupError) throw startupError;
    if (child.exitCode !== null)
      throw new Error("Isolated native transport core exited before readiness");
    try {
      return (await fetch(`${base}/health`)).ok;
    } catch {
      return false;
    }
  }, "The isolated native transport core did not become ready");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.OMNI_QA_CHROMIUM
      ? { executablePath: process.env.OMNI_QA_CHROMIUM }
      : {}),
  });
  const ui = process.env.OMNI_QA_URL || "http://127.0.0.1:3006";
  for (const platform of ["ios", "android"]) {
    page = await nativePage(platform);
    await page.goto(ui);
    if (platform === "android")
      await page
        .getByRole("button", { name: "Guided setup", exact: true })
        .click();
    const setup = page.getByRole("dialog", { name: "Make yourself at home." });
    await setup.waitFor();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("omni.token")),
      owner,
      "Native bootstrap replaces an obsolete browser credential",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.platform),
      platform,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("omni.green")),
      "true",
      "A phone starts in low energy mode",
    );
    assert.equal(await page.getByLabel("Unlock your local session").count(), 0);
    await setup.getByRole("button", { name: "Add new", exact: true }).click();
    assert.equal(
      await setup.getByRole("button", { name: /Local Ollama/ }).count(),
      0,
      "Phone setup does not offer a desktop Ollama installation",
    );
    assert.equal(
      await setup.getByRole("link", { name: /Get Ollama/ }).count(),
      0,
    );
    await setup.getByLabel("Your API key", { exact: true }).waitFor();
    await setup
      .getByRole("button", { name: "Use an existing connection", exact: true })
      .click();
    await page.screenshot({ path: join(artifacts, `${platform}-setup.png`) });

    if (platform === "ios") {
      await setup
        .getByRole("button", { name: "Check connection", exact: true })
        .click();
      await setup
        .getByLabel("Choose your model", { exact: true })
        .selectOption("omni-synthetic");
      assert.equal(
        provider.observations.length,
        0,
        "Discovery does not perform inference",
      );
      await setup
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await page
        .getByLabel("A preference worth remembering")
        .fill(privateMemory);
      await page
        .getByRole("button", { name: "Save preference", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Your space is ready." })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Open your first conversation",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Your message", { exact: true })
        .fill(privatePrompt);
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await page.locator(".chat-entry.assistant").waitFor();
      assert.equal(provider.observations.length, 1);
      assert.equal(
        provider.observations[0].memory_included,
        false,
        "A real gateway keeps ungranted memory private",
      );
      await page
        .getByRole("button", { name: "Close launcher", exact: true })
        .click();
      const state = await api("/api/state");
      assert.equal(
        state.memories.filter(
          (item) =>
            item.content === privateMemory && item.status === "confirmed",
        ).length,
        1,
      );
      assert.equal(state.grants.length, 0);
      assert.equal(state.analytics.opt_in, false);
    } else {
      await setup
        .getByRole("button", { name: "Skip setup", exact: true })
        .click();
    }

    // Navigation and exports use the real ledger but only mock the OS sheet.
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "History", exact: true })
      .click();
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await page
      .getByText("Choose a destination in the system share sheet.", {
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    await until(
      () => exports.filter((item) => item.platform === platform).length >= 2,
      "Native CSV export was not invoked",
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Export configuration without secrets",
        exact: true,
      })
      .click();
    await until(
      () =>
        exports.some(
          (item) =>
            item.platform === platform &&
            item.name === "omni-configuration-without-secrets.json",
        ),
      "Native configuration export was not invoked",
    );

    const beforeLock = calls.filter(
      (item) => item.platform === platform && item.command === "native_session",
    ).length;
    await page
      .getByRole("button", { name: "Lock session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Unlock on this device", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("omni.token")),
      null,
    );
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("omni.locked")),
      "true",
    );
    assert.equal(
      await page.getByText(privateMemory, { exact: true }).count(),
      0,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Unlock on this device", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("omni.token")),
      null,
      "Native provisioning must not unlock a deliberately locked view on reload",
    );
    assert.equal(
      await page.getByLabel("Unlock your local session").count(),
      0,
      "Native unlock never asks the owner to paste a bearer token",
    );
    await page
      .getByRole("button", { name: "Unlock on this device", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Lock session", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("omni.token")),
      owner,
    );
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("omni.locked")),
      null,
    );
    assert.ok(
      calls.filter(
        (item) =>
          item.platform === platform && item.command === "native_session",
      ).length >=
        beforeLock + 2,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: join(artifacts, `${platform}-unlocked.png`),
    });
    await page.context().close();
    page = null;
  }

  const paths = new Set(
    calls
      .filter((item) => item.command === "core_request")
      .map((item) => item.path.split("?")[0]),
  );
  for (const path of [
    "/api/state",
    "/api/admin",
    "/api/memories",
    "/api/chat",
    "/api/interactions",
  ])
    assert.ok(paths.has(path), `Native transport did not exercise ${path}`);
  assert.equal(
    exports.length,
    6,
    "Each platform exports history JSON, history CSV and safe configuration",
  );
  for (const item of exports.filter(
    (item) =>
      item.name.startsWith("omni-history") && item.mime === "application/json",
  )) {
    const data = JSON.parse(item.contents);
    assert.ok(data.items.length > 0);
    assert.equal(data.items[0].status, "succeeded");
  }
  assert.equal(
    browserDownloads,
    0,
    "Native export must not fall back to a browser Blob download",
  );
  assert.deepEqual(
    forbiddenFetches,
    [],
    "Embedded API requests must go through core_request, never browser HTTP",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Native transport QA passed: iOS/Android bootstrap, real local CRUD and inference, IPC-only API traffic, persistent lock/unlock, phone setup, and metadata-only native exports. Browser bridge test only; this does not verify native mobile binaries or OS key stores.",
  );
} catch (error) {
  await page
    ?.screenshot({ path: join(artifacts, "failure.png") })
    .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    await new Promise((done) => {
      child.once("exit", done);
      child.kill("SIGTERM");
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done();
      }, 2000);
      timer.unref();
    });
  }
  await provider.close();
  await rm(directory, { recursive: true, force: true });
}
