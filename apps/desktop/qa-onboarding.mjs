import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import net from "node:net";
import assert from "node:assert/strict";
import { startMockProvider } from "../../scripts/mock-providers.mjs";

const root = resolve(import.meta.dirname, "../..");
const directory = await mkdtemp(join(tmpdir(), "omni-first-run-"));
const artifacts = resolve(root, "apps/desktop/artifacts/onboarding");
await mkdir(artifacts, { recursive: true });
const build = execFileSync(
  process.execPath,
  [resolve(root, "scripts/build-dir.mjs")],
  { encoding: "utf8" },
).trim();
const owner = randomBytes(32).toString("hex");
const pairing = randomBytes(32).toString("hex");
const listener = net.createServer();
await new Promise((ready) => listener.listen(0, "127.0.0.1", ready));
const port = listener.address().port;
await new Promise((closed) => listener.close(closed));
const base = `http://127.0.0.1:${port}`;
const provider = await startMockProvider({
  port: 0,
  name: "First-run fixture",
  kind: "local",
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
    OMNI_PAIRING_SECRET: pairing,
    OMNI_LLM_BASE: `${provider.url}/v1`,
    OMNI_LLM_MODEL: "omni-synthetic",
    OMNI_EXTRACTOR_BASE: `${provider.url}/v1`,
    OMNI_EXTRACTOR_MODEL: "omni-synthetic",
    OMNI_LLM_API_KEY: "",
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
let browser;
let page;
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
  assert.ok(response.ok, `Fixture ${path} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}
try {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null)
      throw new Error("Isolated first-run core exited before readiness");
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {}
    if (attempt === 149)
      throw new Error("Isolated first-run core did not become ready");
    await new Promise((ready) => setTimeout(ready, 100));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.OMNI_QA_CHROMIUM
      ? { executablePath: process.env.OMNI_QA_CHROMIUM }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1060 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  let claims = 0;
  await page.route("http://127.0.0.1:3007/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session/claim") claims++;
    const upstream = await route.fetch({
      url: `${base}${path}${new URL(route.request().url()).search}`,
    });
    await route.fulfill({ response: upstream });
  });
  // An old tab credential must not race or override a new launch exchange.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("qa.seeded")) {
      sessionStorage.setItem("omni.token", "expired-fixture-token");
      sessionStorage.setItem("qa.seeded", "true");
    }
    localStorage.setItem("omni.green", "true");
  });
  await page.goto(
    `http://127.0.0.1:3006/?token=legacy-fixture#connect=${pairing}`,
  );
  await page.getByRole("dialog").waitFor();
  assert.equal(
    new URL(page.url()).hash,
    "",
    "Pairing fragment is removed from browser history",
  );
  assert.equal(
    new URL(page.url()).search,
    "",
    "Legacy query credentials are discarded",
  );
  assert.equal(claims, 1, "StrictMode must not claim a one-time link twice");
  assert.ok(
    (await page.evaluate(() => sessionStorage.getItem("omni.token"))) === owner,
    "Pairing provisions the new session",
  );
  const replay = await fetch(`${base}/api/session/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: pairing }),
  });
  assert.equal(replay.status, 403);
  assert.equal(replay.headers.get("cache-control"), "no-store");
  // The remaining guided flow below uses the application's actual controls.
  const setup = page.getByRole("dialog", { name: "Make yourself at home." });
  await setup
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await setup
    .getByLabel("Choose your model", { exact: true })
    .selectOption("omni-synthetic");
  assert.equal(
    provider.observations.length,
    0,
    "Setup discovery never performs inference",
  );
  await page.screenshot({ path: join(artifacts, "connect.png") });
  await setup.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("heading", { name: "A little context. Yours to keep." })
    .waitFor();
  const preference =
    "SIM_CANARY_FIRST_RUN prefers short, actionable explanations.";
  await page.getByLabel("A preference worth remembering").fill(preference);
  await page
    .getByRole("button", { name: "Save preference", exact: true })
    .click();
  await page.getByRole("heading", { name: "Your space is ready." }).waitFor();
  const configured = await api("/api/state");
  assert.equal(
    configured.memories.filter(
      (memory) =>
        memory.content === preference && memory.status === "confirmed",
    ).length,
    1,
  );
  assert.equal(configured.grants.length, 0, "Onboarding creates no permission");
  assert.equal(
    configured.analytics.opt_in,
    false,
    "Onboarding does not enable analytics",
  );
  assert.equal(provider.observations.length, 0);
  await page.screenshot({ path: join(artifacts, "ready.png") });
  await page
    .getByRole("button", { name: "Open your first conversation" })
    .click();
  await page.getByRole("dialog", { name: "Ask with context" }).waitFor();
  assert.equal(
    await page.getByLabel("Conversation provider").inputValue(),
    "default",
  );
  assert.equal(
    await page.getByLabel("Permission for context").inputValue(),
    "",
  );
  await page
    .getByRole("button", { name: "Help me plan my next project.", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Your message").inputValue(),
    "Help me plan my next project.",
  );
  assert.equal(
    provider.observations.length,
    0,
    "Suggestions only prepare a draft",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".chat-entry.assistant").waitFor();
  assert.equal(provider.observations.length, 1);
  assert.equal(
    provider.observations[0].memory_included,
    false,
    "An ungranted preference stays in the vault",
  );
  await page.screenshot({ path: join(artifacts, "conversation.png") });
  await page.getByRole("button", { name: "Close launcher" }).click();
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole("button", { name: "Guided setup" }).click();
  await page.getByRole("dialog", { name: "Make yourself at home." }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: join(artifacts, "mobile-setup.png") });
  await page.keyboard.press("Control+k");
  assert.equal(
    await page.getByRole("dialog", { name: "Ask with context" }).count(),
    0,
    "The wizard owns focus",
  );
  await page.getByRole("button", { name: "Skip setup", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1060 });
  await page.getByRole("button", { name: "Lock session", exact: true }).click();
  await page.getByLabel("Unlock your local session").waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("omni.token")),
    null,
  );
  assert.equal(claims, 1);
  await page.reload();
  await page.getByLabel("Unlock your local session").waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("omni.token")),
    null,
    "Locked session stays locked after reload",
  );
  const expiredPage = await browser.newPage();
  expiredPage.on("pageerror", (error) => errors.push(error.message));
  await expiredPage.route("http://127.0.0.1:3007/**", async (route) => {
    const source = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({
        url: `${base}${source.pathname}${source.search}`,
      }),
    });
  });
  await expiredPage.addInitScript(() => {
    if (!sessionStorage.getItem("qa.seeded")) {
      sessionStorage.setItem("omni.token", "stale-fixture-token");
      sessionStorage.setItem("qa.seeded", "true");
    }
  });
  await expiredPage.goto(`http://127.0.0.1:3006/#connect=${pairing}`);
  await expiredPage
    .getByText(/This private launch link expired or was already used/)
    .waitFor();
  assert.equal(
    await expiredPage.evaluate(() => sessionStorage.getItem("omni.token")),
    null,
    "Failed pairing clears obsolete credentials",
  );
  await expiredPage.reload();
  await expiredPage.getByLabel("Unlock your local session").waitFor();
  assert.equal(
    await expiredPage.evaluate(() => sessionStorage.getItem("omni.token")),
    null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "First-run QA passed: one-time pairing, legacy credential rejection, discovery-only setup, optional memory without grants, first conversation, draft suggestions, mobile layout and persistent lock.",
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
