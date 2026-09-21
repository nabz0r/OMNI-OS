import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import net from "node:net";
import assert from "node:assert/strict";
import { startMockProvider } from "../../scripts/mock-providers.mjs";

const root = resolve(import.meta.dirname, "../..");
const directory = await mkdtemp(join(tmpdir(), "omni-setup-create-"));
const artifacts = resolve(root, "apps/desktop/artifacts/setup-new-profile");
await mkdir(artifacts, { recursive: true });
const build = execFileSync(
  process.execPath,
  [resolve(root, "scripts/build-dir.mjs")],
  { encoding: "utf8" },
).trim();
const owner = randomBytes(32).toString("hex");
const reserve = net.createServer();
await new Promise((ready) => reserve.listen(0, "127.0.0.1", ready));
const port = reserve.address().port;
await new Promise((done) => reserve.close(done));
const base = `http://127.0.0.1:${port}`;
const provider = await startMockProvider({
  port: 0,
  name: "Setup creation QA",
  kind: "local",
});
const originalHandler = provider.server.listeners("request")[0];
provider.server.removeAllListeners("request");
let catalogFailure = 0;
let requiredKey = "";
let authenticatedCatalogs = 0;
provider.server.on("request", (req, res) => {
  if (req.url.split("?")[0] === "/v1/models") {
    if (catalogFailure) {
      res.writeHead(catalogFailure, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Synthetic catalog temporarily unavailable" }),
      );
    }
    if (requiredKey && req.headers.authorization !== `Bearer ${requiredKey}`) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Synthetic credential rejected" }),
      );
    }
    if (requiredKey) authenticatedCatalogs++;
  }
  return originalHandler(req, res);
});
const child = spawn(resolve(build, "debug/omni-core"), [], {
  stdio: "ignore",
  env: {
    ...process.env,
    OMNI_DATA_DIR: directory,
    OMNI_KEY_STORAGE: "file",
    OMNI_CORE_PORT: String(port),
    OMNI_LOCAL_TOKEN: owner,
    OMNI_AGENT_TOKEN: randomBytes(32).toString("hex"),
    OMNI_PAIRING_SECRET: randomBytes(32).toString("hex"),
    OMNI_LLM_BASE: `${provider.url}/v1`,
    OMNI_LLM_MODEL: "omni-synthetic",
    OMNI_LLM_API_KEY: "",
    OMNI_EXTRACTOR_BASE: `${provider.url}/v1`,
    OMNI_EXTRACTOR_MODEL: "omni-synthetic",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OMNI_ANTHROPIC_BASE: "https://api.anthropic.com/v1",
    OMNI_SIMULATION: "0",
    OMNI_ANALYTICS_OPT_IN: "false",
    OMNI_SOCKS_PROXY: "",
    OMNI_VPN_REQUIRED: "false",
    OMNI_UPSTREAM_ALLOWLIST: `${provider.url}/v1`,
  },
});
let startupError;
child.once("error", () => {
  startupError = new Error(
    "Could not start the isolated core. Build the Rust workspace first.",
  );
});
let browser, page;
const errors = [];
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${owner}`,
      "content-type": "application/json",
      ...options.headers,
    },
  });
  assert.ok(response.ok, `Isolated API ${path} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function until(check, label) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(label);
}
try {
  await until(async () => {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error("Isolated core exited");
    try {
      return (await fetch(`${base}/health`)).ok;
    } catch {
      return false;
    }
  }, "Isolated core readiness");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.OMNI_QA_CHROMIUM
      ? { executablePath: process.env.OMNI_QA_CHROMIUM }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://127.0.0.1:3007/**", async (route) => {
    const source = new URL(route.request().url());
    const response = await route.fetch({
      url: `${base}${source.pathname}${source.search}`,
    });
    if (
      route.request().method() === "PATCH" &&
      source.pathname.startsWith("/api/providers/") &&
      typeof route.request().postDataJSON()?.api_key === "string"
    ) {
      // The core may commit a key before the browser receives its response.
      await new Promise((ready) => setTimeout(ready, 250));
    }
    await route.fulfill({
      response,
    });
  });
  await page.addInitScript((value) => {
    sessionStorage.setItem("omni.token", value);
    localStorage.setItem("omni.green", "true");
  }, owner);
  await page.goto("http://127.0.0.1:3006");
  const setup = page.locator(".setup-dialog");
  await page.getByRole("dialog", { name: "Make yourself at home." }).waitFor();
  const initial = await api("/api/admin");
  assert.equal(
    await setup.getByLabel(/API key for/).isVisible(),
    false,
    "Optional localhost credentials should initially be collapsed",
  );
  await setup.getByRole("button", { name: "Add new", exact: true }).click();
  await setup
    .getByLabel("Connection name", { exact: true })
    .fill("[QA synthetic] Guided local");
  await setup.locator(".setup-endpoint-settings > summary").click();
  await setup
    .getByLabel("API base URL", { exact: true })
    .fill("ftp://127.0.0.1/v1");
  await setup
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await setup.getByRole("alert").waitFor();
  assert.equal(
    (await api("/api/admin")).providers.length,
    initial.providers.length,
    "Rejected URLs must not persist a profile",
  );
  assert.equal(
    await setup.getByLabel("Connection name", { exact: true }).inputValue(),
    "[QA synthetic] Guided local",
    "Validation preserves the draft for correction",
  );
  await setup
    .getByLabel("API base URL", { exact: true })
    .fill(`${provider.url}/v1`);
  await setup
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await setup.getByLabel("Your connection", { exact: true }).waitFor();
  let created = (await api("/api/admin")).providers.find(
    (item) => item.label === "[QA synthetic] Guided local",
  );
  assert.ok(created);
  const createdId = created.id;
  assert.equal(created.model, "");
  assert.equal(created.status, "not_checked");
  await until(
    async () =>
      (await setup.getByLabel("Your connection").inputValue()) === createdId,
    "The new connection should become the selected profile",
  );
  assert.equal(
    await setup
      .getByRole("button", { name: "Continue", exact: true })
      .isDisabled(),
    true,
  );
  catalogFailure = 503;
  await setup
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Try connection again", exact: true })
    .waitFor();
  await setup
    .getByText("Ollama needs to be running with a model installed.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await api("/api/admin")).providers.find((item) => item.id === createdId)
      .status,
    "unavailable",
  );
  assert.equal(
    await setup
      .getByRole("button", { name: "Continue", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(provider.observations.length, 0);
  await page.screenshot({ path: join(artifacts, "connection-retry.png") });
  catalogFailure = 0;
  await setup
    .getByRole("button", { name: "Try connection again", exact: true })
    .click();
  await setup
    .locator("select")
    .filter({ has: page.locator('option[value="omni-synthetic"]') })
    .waitFor();
  assert.equal(
    await setup.getByLabel("Choose your model", { exact: true }).inputValue(),
    "",
    "Discovery must not silently choose a model",
  );
  assert.equal(
    await setup
      .getByRole("button", { name: "Continue", exact: true })
      .isDisabled(),
    true,
  );
  await setup
    .getByRole("button", { name: "Enter an ID instead", exact: true })
    .click();
  await setup
    .getByLabel("Choose your model", { exact: true })
    .fill("qa-unlisted-model");
  await until(
    async () =>
      await setup
        .getByRole("button", { name: "Continue", exact: true })
        .isEnabled(),
    "An explicit model ID should enable continuing after a successful connection check",
  );
  await setup
    .getByRole("button", { name: "Choose from catalog", exact: true })
    .click();
  assert.equal(
    await setup.getByLabel("Choose your model", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await setup
      .getByRole("button", { name: "Continue", exact: true })
      .isDisabled(),
    true,
    "Returning to the catalog must clear an unlisted manual model",
  );
  await setup
    .getByLabel("Choose your model", { exact: true })
    .selectOption("omni-synthetic");
  await setup.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("heading", { name: "A little context. Yours to keep." })
    .waitFor();
  let state = await api("/api/admin");
  created = state.providers.find((item) => item.id === createdId);
  assert.equal(created.model, "omni-synthetic");
  assert.equal(state.settings.primary_provider_id, createdId);
  await setup.getByRole("button", { name: "Not now", exact: true }).click();
  await page.getByRole("heading", { name: "Your space is ready." }).waitFor();
  state = await api("/api/state");
  assert.equal(state.memories.length, 0);
  assert.equal(state.grants.length, 0);
  assert.equal(state.analytics.opt_in, false);
  assert.equal(state.vault.encrypted, true);
  assert.equal(provider.observations.length, 0);
  await setup
    .getByRole("button", { name: "Open your first conversation", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Ask with context" }).waitFor();
  assert.equal(
    await page.getByLabel("Conversation provider").inputValue(),
    createdId,
  );
  assert.equal(
    await page.getByLabel("Conversation model").inputValue(),
    "omni-synthetic",
  );
  assert.equal(
    await page.getByLabel("Permission for context").inputValue(),
    "",
  );
  assert.equal(
    provider.observations.length,
    0,
    "Opening a conversation must not send anything",
  );
  await page
    .getByRole("button", { name: "Close launcher", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Guided setup", exact: true }).click();
  await setup.waitFor();
  await until(
    async () =>
      (await setup.getByLabel("Your connection").inputValue()) === createdId,
    "The selected connection should persist after reloading",
  );
  await until(
    async () =>
      (await setup.getByLabel("Choose your model").inputValue()) ===
      "omni-synthetic",
    "The selected model should appear after reloading",
  );
  // The optional disclosure remains usable for local endpoints that do require a key.
  requiredKey = `qa-local-key-${randomBytes(8).toString("hex")}`;
  await setup
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Try connection again", exact: true })
    .waitFor();
  const keyField = setup.getByLabel("API key for [QA synthetic] Guided local", {
    exact: true,
  });
  await keyField.waitFor();
  await keyField.fill(requiredKey);
  await setup
    .getByRole("button", { name: "Save API key", exact: true })
    .click();
  await until(
    async () =>
      (await api("/api/admin")).providers.find((item) => item.id === createdId)
        .has_api_key,
    "Local authentication key was not saved",
  );
  await until(
    async () => (await keyField.inputValue()) === "",
    "Successful key writes must clear the input",
  );
  const publicAdmin = await api("/api/admin");
  assert.equal(
    JSON.stringify(publicAdmin).includes(requiredKey),
    false,
    "Public profiles must never return stored API keys",
  );
  await setup
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await setup.getByText("Connection checked", { exact: true }).waitFor();
  assert.ok(authenticatedCatalogs > 0);
  assert.equal(provider.observations.length, 0);
  // Cloud presets also save credentials through the real encrypted core, using only this loopback fixture.
  await setup.getByRole("button", { name: "Add new", exact: true }).click();
  await setup
    .getByRole("button", { name: "OpenAI Your API key", exact: true })
    .click();
  await setup
    .getByLabel("Connection name", { exact: true })
    .fill("[QA synthetic] Guided API");
  await setup.getByLabel("Your API key", { exact: true }).fill(requiredKey);
  await setup.locator(".setup-endpoint-settings > summary").click();
  await setup
    .getByLabel("API base URL", { exact: true })
    .fill(`${provider.url}/v1`);
  await setup
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await setup.getByLabel("Your connection", { exact: true }).waitFor();
  const cloud = (await api("/api/admin")).providers.find(
    (item) => item.label === "[QA synthetic] Guided API",
  );
  assert.equal(cloud.kind, "openai");
  assert.equal(cloud.has_api_key, true);
  assert.equal(cloud.model, "");
  assert.equal(
    await setup.getByLabel(/API key for/).isVisible(),
    false,
    "Local fixture credentials stay in the optional disclosure",
  );
  await setup
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await setup.getByText("Connection checked", { exact: true }).waitFor();
  assert.equal(
    await setup.getByLabel("Choose your model", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await setup
      .getByRole("button", { name: "Continue", exact: true })
      .isDisabled(),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await setup.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    ),
    false,
  );
  await page.screenshot({ path: join(artifacts, "created-api-mobile.png") });
  await setup.getByRole("button", { name: "Skip setup", exact: true }).click();
  assert.equal(
    (await api("/api/admin")).settings.primary_provider_id,
    createdId,
    "Skipping an unconfigured profile preserves the chosen default",
  );
  const files = await readdir(directory);
  const vaultName = files.find((name) => /\.(db|sqlite|sqlite3)$/.test(name));
  assert.ok(vaultName, "A temporary encrypted vault should exist");
  assert.notEqual(
    (await readFile(join(directory, vaultName))).subarray(0, 15).toString(),
    "SQLite format 3",
    "The vault must not be a plaintext SQLite file",
  );
  assert.deepEqual(errors, []);
  assert.equal(provider.observations.length, 0);
  console.log(
    "Isolated Setup creation QA passed: encrypted temporary vault, invalid endpoint correction, local/OpenAI profile creation, real catalog 503 + recovery, explicit/manual model choice, default persistence across reload, optional memory, zero grants/inference, auth-error key recovery, write-only credentials, mobile layout.",
  );
} catch (error) {
  await page
    ?.screenshot({ path: join(artifacts, "failure.png") })
    .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode === null)
    await new Promise((done) => {
      child.once("exit", done);
      child.kill("SIGTERM");
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done();
      }, 2000);
      timer.unref();
    });
  await provider.close();
  await rm(directory, { recursive: true, force: true });
}
