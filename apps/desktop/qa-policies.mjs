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
const directory = await mkdtemp(join(tmpdir(), "omni-policy-"));
const artifacts = resolve(root, "apps/desktop/artifacts/policies");
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
  name: "Policy QA",
  kind: "local",
});
const isolatedEnv = { ...process.env };
delete isolatedEnv.OMNI_MANAGED_POLICY_FILE;
const child = spawn(resolve(build, "debug/omni-core"), [], {
  stdio: "ignore",
  env: {
    ...isolatedEnv,
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
    OMNI_MANAGED_POLICY_FILE: resolve(root, "infra/policies/organization.json"),
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
  page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://127.0.0.1:3007/**", async (route) => {
    const source = new URL(route.request().url());
    const response = await route.fetch({
      url: `${base}${source.pathname}${source.search}`,
    });
    await route.fulfill({ response });
  });
  await page.addInitScript((value) => {
    sessionStorage.setItem("omni.token", value);
    localStorage.setItem("omni.green", "true");
  }, owner);
  await page.goto("http://127.0.0.1:3006");
  await page.getByRole("button", { name: "Skip setup", exact: true }).click();
  const nav = async (name) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
  await nav("Policies");
  await page.getByRole("heading", { name: "Build your rule chain." }).waitFor();
  await page
    .getByRole("heading", { name: "Organization baseline", exact: true })
    .waitFor();
  await page.getByText("Read only", { exact: true }).waitFor();
  await page
    .getByLabel("Policy sample", { exact: true })
    .fill("-----BEGIN PRIVATE KEY-----");
  await page
    .getByRole("button", { name: "Test saved policy", exact: true })
    .click();
  await page.getByText("This sample is blocked.", { exact: true }).waitFor();
  await page
    .locator(".policy-verdict")
    .getByText("managed policy · revision 0", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page
    .getByLabel("Rule 1 name", { exact: true })
    .fill("Block restricted project content");
  await page.getByLabel("Rule 1 pattern", { exact: true }).fill("(");
  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "unsupported" }).waitFor();
  assert.equal((await api("/api/policies")).revision, 0);
  assert.equal(
    await page.getByLabel("Rule 1 pattern", { exact: true }).inputValue(),
    "(",
  );
  await page
    .getByLabel("Rule 1 pattern", { exact: true })
    .fill("(?i)RESTRICTED_PROJECT");
  await page.getByLabel("Allow .csv files", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Revision 1" }).waitFor();
  await page
    .getByLabel("Policy sample", { exact: true })
    .fill("A RESTRICTED_PROJECT should stay local.");
  await page
    .getByRole("button", { name: "Test saved policy", exact: true })
    .click();
  await page.getByText("This sample is blocked.", { exact: true }).waitFor();
  assert.equal(provider.observations.length, 0);
  assert.equal((await api("/api/policies/decisions")).retained, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(artifacts, "policy-desktop.png"),
    fullPage: false,
  });
  await page
    .getByLabel("Policy sample", { exact: true })
    .fill("A public project update.");
  await page
    .getByRole("button", { name: "Test saved policy", exact: true })
    .click();
  await page.getByText("This sample is allowed.", { exact: true }).waitFor();
  await page.getByLabel("Policy test files", { exact: true }).setInputFiles({
    name: "public.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("public,123"),
  });
  await page
    .locator(".policy-test-files")
    .getByText("public.csv", { exact: false })
    .waitFor();
  await page
    .getByRole("button", { name: "Test saved policy", exact: true })
    .click();
  await page.getByText("File type not allowed", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Remove test file 1", exact: true })
    .click();
  await nav("Overview");
  await page.getByRole("button", { name: /Ask with context/ }).click();
  await page
    .getByLabel("Your message", { exact: true })
    .fill("RESTRICTED_PROJECT");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Request blocked" })
    .waitFor();
  assert.equal(
    provider.observations.length,
    0,
    "Blocked content must not reach the provider",
  );
  assert.equal(
    await page.getByLabel("Your message", { exact: true }).inputValue(),
    "RESTRICTED_PROJECT",
  );
  await page
    .getByLabel("Your message", { exact: true })
    .fill("Summarize the attached public note.");
  await page.getByLabel("Attach text files", { exact: true }).setInputFiles({
    name: "public.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("A public project update."),
  });
  await page
    .getByRole("button", { name: "Remove attached file 1", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".chat-entry.assistant").waitFor();
  assert.equal(provider.observations.length, 1);
  await page
    .getByRole("button", { name: "Close launcher", exact: true })
    .click();
  await nav("Policies");
  await page.getByLabel("Maximum files", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Revision 2" }).waitFor();
  await nav("Overview");
  await page.getByRole("button", { name: /Ask with context/ }).click();
  await page
    .getByLabel("Your message", { exact: true })
    .fill("Continue the summary.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "too_many_files" }).waitFor();
  assert.equal(
    provider.observations.length,
    1,
    "Historical attachments must be rechecked against current policy",
  );
  await page
    .getByRole("button", { name: "Close launcher", exact: true })
    .click();
  await nav("Policies");
  await page
    .getByRole("button", { name: "Refresh decisions", exact: true })
    .click();
  await page.getByText("Too many files", { exact: true }).waitFor();
  const decisions = await api("/api/policies/decisions");
  assert.equal(decisions.retained, 3);
  assert.equal(decisions.blocked, 2);
  assert.ok(!JSON.stringify(decisions).includes("RESTRICTED_PROJECT"));
  assert.ok(!JSON.stringify(decisions).includes("public.txt"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(artifacts, "policy-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    "Mobile policy view must not overflow",
  );
  await page.reload();
  await nav("Policies");
  await until(
    async () =>
      (await page.getByLabel("Maximum files", { exact: true }).inputValue()) ===
      "0",
    "Saved policy should survive reload",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Policy UI QA passed: invalid regex recovery, saved revision, local allow/deny preview, file type rejection, zero-egress deny, successful text attachment, follow-up revalidation, metadata-only decisions, persistence and mobile layout.",
  );
} catch (error) {
  await page
    ?.screenshot({ path: join(artifacts, "failure.png"), fullPage: true })
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
