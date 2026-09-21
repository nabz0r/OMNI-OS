import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.OMNI_PLAYWRIGHT_MODULE || "playwright",
);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const token = (
  await readFile(resolve(root, ".omni/runtime/admin-token"), "utf8")
).trim();
const out = resolve(here, "artifacts", "console");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.OMNI_QA_CHROMIUM
    ? { executablePath: process.env.OMNI_QA_CHROMIUM }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1060 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const api = async (path, options = {}) => {
  const response = await page.request.fetch(`http://127.0.0.1:3007${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!response.ok())
    throw new Error(
      `Console QA API ${path.split("?")[0]} returned HTTP ${response.status()}`,
    );
  return response.status() === 204 ? null : response.json();
};
const until = async (check, message) => {
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
};
const navigate = async (name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
const screenshot = async (name, fullPage = true) =>
  page.screenshot({ path: resolve(out, `${name}.png`), fullPage });
const downloadText = async (button) => {
  const pending = page.waitForEvent("download");
  await button.click();
  const result = await pending;
  const path = await result.path();
  assert.ok(path, "Download should produce a local file");
  return readFile(path, "utf8");
};
const syntheticName = `[QA synthetic] Console ${Date.now()}`;
const editedName = `${syntheticName} revised`;
const fakeKey = `qa-fixture-credential-${Date.now()}`;
const promptMarker = `QA_CONSOLE_PRIVATE_BODY_${Date.now()}`;
let providerId = null;
let originalSettings = null;
let originalGreen = null;
const assertMetadataOnly = (value) => {
  const text = JSON.stringify(value);
  for (const secret of [token, fakeKey, promptMarker])
    assert.equal(
      text.includes(secret),
      false,
      "Exports and metadata must exclude credentials and prompt text",
    );
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
  const visit = (object) => {
    if (!object || typeof object !== "object") return;
    for (const [key, item] of Object.entries(object)) {
      assert.equal(
        forbidden.has(key.toLowerCase()),
        false,
        `Unexpected private field ${key}`,
      );
      if (item && typeof item === "object") visit(item);
    }
  };
  visit(value);
};
try {
  const initial = await api("/api/state");
  assert.equal(
    initial.stats?.simulation,
    true,
    "Console mutation QA requires the isolated --simulate stack",
  );
  const initialAdmin = await api("/api/admin");
  originalSettings = initialAdmin.settings;
  const fixture = initialAdmin.providers.find(
    (provider) => provider.kind === "anthropic" && provider.enabled,
  );
  assert.ok(
    fixture,
    "Simulation must include an Anthropic fixture with explicit cache counters",
  );
  const fixtureUrl = new URL(fixture.base_url);
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(fixtureUrl.hostname),
    "QA must never call a remote provider",
  );
  const fixtureHealth = await page.request.get(`${fixtureUrl.origin}/health`);
  assert.equal((await fixtureHealth.json()).simulation, true);
  const catalogResponse = await page.request.get(`${fixture.base_url}/models`);
  const fixtureModel = (await catalogResponse.json()).data?.[0]?.id;
  assert.equal(
    typeof fixtureModel,
    "string",
    "Simulation must advertise a model",
  );
  await page.goto("http://127.0.0.1:3006");
  await page.getByLabel("Unlock your local session").fill(token);
  await page.getByRole("button", { name: "Open my space" }).click();
  await page.getByRole("heading", { name: "Your constellation" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Your constellation" }).waitFor();
  assert.equal(
    await page.getByText(/signal is aborted|aborted without reason/i).count(),
    0,
    "Session restoration must not show StrictMode cancellation as a service failure",
  );
  originalGreen = await page.evaluate(() => localStorage.getItem("omni.green"));

  await navigate("Models");
  await page
    .getByRole("heading", { name: "Your model control room." })
    .waitFor();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Connect a provider" });
  await editor.getByRole("button", { name: /Anthropic/ }).click();
  await editor.getByLabel("Connection name").fill(syntheticName);
  await editor.getByLabel("API base URL").fill(fixture.base_url);
  await editor.getByLabel("Default model ID").fill("");
  await editor.getByLabel("API key", { exact: true }).fill(fakeKey);
  await editor.locator(".provider-pricing > summary").click();
  await editor
    .getByRole("checkbox", { name: "Use manually configured USD rates" })
    .check();
  await editor.getByLabel("Input / 1M", { exact: true }).fill("2");
  await editor.getByLabel("Output / 1M", { exact: true }).fill("8");
  await editor.getByLabel("Cached input / 1M", { exact: true }).fill("0.5");
  await editor.getByLabel("Cache writes / 1M", { exact: true }).fill("2.5");
  await editor
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await editor.waitFor({ state: "hidden" });
  let administration = await api("/api/admin");
  let profile = administration.providers.find(
    (provider) => provider.label === syntheticName,
  );
  assert.ok(profile, "Provider was persisted");
  providerId = profile.id;
  assert.equal(profile.model, "");
  assert.equal(profile.has_api_key, true);
  assert.deepEqual(profile.rates, {
    currency: "USD",
    input_per_million: 2,
    output_per_million: 8,
    cached_input_per_million: 0.5,
    cache_write_input_per_million: 2.5,
  });
  assertMetadataOnly(administration);
  const card = () => page.locator(`[data-provider-id="${providerId}"]`);
  await page
    .getByRole("button", { name: "Ask with context", exact: true })
    .click();
  await page.getByLabel("Conversation provider").selectOption(providerId);
  const modelSelect = page.getByLabel("Conversation model");
  assert.equal(await modelSelect.inputValue(), "");
  assert.equal(
    await modelSelect.locator("option:checked").innerText(),
    "Choose a model",
    "A provider without a model must not display the primary provider's model",
  );
  await page
    .getByLabel("Your message")
    .fill(`${promptMarker} — an explicit model is required before sending.`);
  assert.equal(
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .isDisabled(),
    true,
    "A nonempty message must not enable sending without a model",
  );
  assert.equal(
    (await api(`/api/interactions?provider_id=${providerId}&period=all`)).total,
    0,
  );
  await page.getByRole("button", { name: "Manage model connections" }).click();
  await card().getByRole("button", { name: "Check connection" }).click();
  await card().getByText("Available", { exact: true }).waitFor();
  profile = (await api("/api/admin")).providers.find(
    (provider) => provider.id === providerId,
  );
  assert.equal(profile.status, "available");
  assert.ok(profile.models.includes(fixtureModel));
  assert.equal(
    profile.loaded_models,
    null,
    "API catalogs must not imply a model is loaded locally",
  );
  assert.equal(profile.model, "", "Discovery must not silently choose a model");
  await card()
    .getByRole("button", { name: /available models?$/ })
    .click();
  await card().getByRole("button", { name: fixtureModel, exact: true }).click();
  await until(
    async () =>
      (await api("/api/admin")).providers.find(
        (provider) => provider.id === providerId,
      )?.model === fixtureModel,
    "An explicit catalog selection should set the provider's default model",
  );
  profile = (await api("/api/admin")).providers.find(
    (provider) => provider.id === providerId,
  );
  assert.equal(
    profile.rates,
    null,
    "Changing the default model must clear prices configured for the old model",
  );
  await card().getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit provider" });
  assert.equal(
    await edit.locator("#provider-key").inputValue(),
    "",
    "A saved API key must never be populated back into the editor",
  );
  await edit.getByLabel("Connection name").fill(editedName);
  const pricing = edit.getByRole("checkbox", {
    name: "Use manually configured USD rates",
  });
  if (!(await pricing.isVisible()))
    await edit.locator(".provider-pricing > summary").click();
  assert.equal(
    await pricing.isChecked(),
    false,
    "The editor must require explicit rates for the newly selected model",
  );
  await pricing.check();
  await edit.getByLabel("Input / 1M", { exact: true }).fill("3");
  await edit.getByLabel("Output / 1M", { exact: true }).fill("8");
  await edit.getByLabel("Cached input / 1M", { exact: true }).fill("0.5");
  await edit.getByLabel("Cache writes / 1M", { exact: true }).fill("2.5");
  await edit
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await edit.waitFor({ state: "hidden" });
  await card()
    .getByRole("heading", { name: editedName, exact: true })
    .waitFor();
  profile = (await api("/api/admin")).providers.find(
    (provider) => provider.id === providerId,
  );
  assert.equal(profile.rates.input_per_million, 3);
  assert.equal(
    profile.has_api_key,
    true,
    "Editing non-secret settings should preserve the encrypted credential",
  );
  await card()
    .getByRole("button", { name: "Use by default", exact: true })
    .click();
  await card().getByText("Default", { exact: true }).waitFor();
  assert.equal(
    (await api("/api/admin")).settings.primary_provider_id,
    providerId,
  );
  await screenshot("models");

  await page
    .getByRole("button", { name: "Ask with context", exact: true })
    .click();
  await page.getByLabel("Conversation provider").selectOption(providerId);
  await page.getByLabel("Permission for context").selectOption("");
  await page
    .getByLabel("Your message")
    .fill(`${promptMarker} — synthetic console verification only.`);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".chat-entry.assistant").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Close launcher" }).click();
  // Real local fixture requests create enough records to exercise backend pagination.
  for (let offset = 0; offset < 26; offset += 4) {
    await Promise.all(
      Array.from({ length: Math.min(4, 26 - offset) }, (_, index) =>
        api("/api/chat", {
          method: "POST",
          data: {
            provider_id: providerId,
            model: fixtureModel,
            message: `${promptMarker} — pagination sample ${offset + index}`,
          },
        }),
      ),
    );
  }
  const journal = await api(
    `/api/interactions?provider_id=${providerId}&limit=100&period=all`,
  );
  assert.equal(journal.total, 27);
  for (const item of journal.items) {
    assert.equal(item.provider_id, providerId);
    assert.equal(item.status, "succeeded");
    assert.ok(item.request_bytes > 0 && item.response_bytes > 0);
    assert.ok(item.total_tokens > 0);
    assert.ok(item.estimated_cost > 0);
    assert.equal(item.rate_snapshot.input_per_million, 3);
  }
  assertMetadataOnly(journal);
  await navigate("History");
  await page.getByRole("tab", { name: "Requests", exact: true }).click();
  await page
    .getByRole("heading", { name: "Every request, accounted for." })
    .waitFor();
  await page.getByLabel("Filter by provider").selectOption(providerId);
  await page.getByText("27 matching records", { exact: true }).waitFor();
  await until(
    async () => (await page.locator(".ops-table tbody tr").count()) === 25,
    "History first page should contain 25 records",
  );
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByText("26–27 of 27 records", { exact: true }).waitFor();
  assert.equal(await page.locator(".ops-table tbody tr").count(), 2);
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await page.getByText("1–25 of 27 records", { exact: true }).waitFor();
  const first = journal.items[0];
  await page
    .getByRole("button", { name: `Open request ${first.id}`, exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: fixtureModel, exact: true });
  await detail.waitFor();
  assert.ok((await detail.innerText()).includes("Recorded rate snapshot"));
  assert.equal((await detail.innerText()).includes(promptMarker), false);
  await screenshot("request-detail", false);
  await page.keyboard.press("Escape");
  await detail.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: `Open request ${first.id}`, exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
    "Closing request details restores focus",
  );
  const jsonExport = JSON.parse(
    await downloadText(page.getByRole("button", { name: "JSON", exact: true })),
  );
  assert.equal(jsonExport.scope, "current_page_metadata");
  assert.equal(jsonExport.items.length, 25);
  assertMetadataOnly(jsonExport);
  const csvExport = await downloadText(
    page.getByRole("button", { name: "CSV", exact: true }),
  );
  assert.ok(csvExport.startsWith('"id","started_at"'));
  assert.equal(csvExport.includes(promptMarker), false);
  assert.equal(csvExport.includes(fakeKey), false);
  await screenshot("history");
  await page.getByLabel("Search request metadata").fill("QA_NO_SUCH_MODEL");
  await page.getByRole("heading", { name: "No matching requests" }).waitFor();
  await page.getByLabel("Search request metadata").fill("");
  await page.getByText("27 matching records", { exact: true }).waitFor();
  await page.getByLabel("Filter request status").selectOption("failed");
  await page.getByRole("heading", { name: "No matching requests" }).waitFor();
  await page.getByLabel("Filter request status").selectOption("succeeded");
  await page.getByText("27 matching records", { exact: true }).waitFor();
  // A controlled metadata-read failure verifies recovery without fabricating records.
  await page.route("**/api/interactions?**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "QA journal temporarily unavailable" },
    }),
  );
  await page
    .locator(".ops")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "QA journal temporarily unavailable" })
    .waitFor();
  await page.unroute("**/api/interactions?**");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByText("27 matching records", { exact: true }).waitFor();

  await navigate("Usage");
  await page
    .getByRole("heading", { name: "Understand what you use." })
    .waitFor();
  await page
    .getByRole("heading", { name: "Model activity", exact: true })
    .waitFor();
  const usage = await api("/api/usage?period=7d");
  const modelUsage = usage.models.find(
    (model) => model.provider_id === providerId,
  );
  assert.equal(modelUsage.totals.interactions, 27);
  assert.equal(modelUsage.totals.priced_interactions, 27);
  assert.ok(modelUsage.totals.estimated_cost > 0);
  assert.ok(
    (await page.locator(".ops").innerText()).includes(
      "not measured bandwidth saved",
    ),
  );
  const usageExport = JSON.parse(
    await downloadText(page.getByRole("button", { name: "JSON", exact: true })),
  );
  assert.equal(usageExport.scope, "selected_period_model_metadata");
  assertMetadataOnly(usageExport);
  assert.equal(
    usageExport.items.find((item) => item.provider_id === providerId)
      .interactions,
    27,
  );
  await screenshot("usage");

  await navigate("Logs");
  await page
    .getByRole("heading", { name: "Local audit journal", exact: true })
    .waitFor();
  await page.getByLabel("Search audit events").fill(providerId);
  await until(
    async () => (await page.locator(".ops-table tbody tr").count()) > 0,
    "Provider changes should appear in the audit journal",
  );
  const audit = await api(
    `/api/logs?provider_id=${providerId}&period=all&limit=100`,
  );
  assert.ok(audit.items.some((item) => item.action === "provider_created"));
  assert.ok(audit.items.some((item) => item.action === "provider_updated"));
  assert.ok(audit.items.some((item) => item.action === "provider_probed"));
  assertMetadataOnly(audit);
  await page.getByLabel("Filter audit level").selectOption("info");
  const logsExport = JSON.parse(
    await downloadText(page.getByRole("button", { name: "JSON", exact: true })),
  );
  assert.ok(logsExport.items.every((item) => item.level === "info"));
  assertMetadataOnly(logsExport);
  await screenshot("logs");

  await navigate("Settings");
  await page
    .getByRole("heading", { name: "Make OMNI work your way." })
    .waitFor();
  const newRetention =
    originalSettings.history_retention_days === 365
      ? 364
      : originalSettings.history_retention_days + 1;
  await page.getByLabel("History retention in days").fill(String(newRetention));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await until(
    async () =>
      (await api("/api/admin")).settings.history_retention_days ===
      newRetention,
    "Retention preference should persist",
  );
  if (!(await api("/api/admin")).settings.history_enabled)
    await page
      .getByRole("switch", { name: "Keep interaction metadata" })
      .click();
  await page.getByRole("switch", { name: "Keep interaction metadata" }).click();
  await until(
    async () => (await api("/api/admin")).settings.history_enabled === false,
    "Recording should pause",
  );
  const beforePause = await api(
    `/api/interactions?provider_id=${providerId}&period=all`,
  );
  const stateBeforePause = await api("/api/state");
  await api("/api/chat", {
    method: "POST",
    data: {
      provider_id: providerId,
      message: `${promptMarker} — excluded from paused metadata history`,
    },
  });
  assert.equal(
    (await api(`/api/interactions?provider_id=${providerId}&period=all`)).total,
    beforePause.total,
  );
  assert.equal(
    (await api("/api/state")).analytics.budget_used,
    stateBeforePause.analytics.budget_used,
  );
  await page.getByRole("switch", { name: "Keep interaction metadata" }).click();
  await until(
    async () => (await api("/api/admin")).settings.history_enabled === true,
    "Recording should resume",
  );
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Clear interaction history?" })
    .waitFor();
  await page.getByRole("button", { name: "Keep history", exact: true }).click();
  assert.equal(
    (await api(`/api/interactions?provider_id=${providerId}&period=all`)).total,
    beforePause.total,
    "Cancelling history deletion preserves records",
  );
  const configuration = JSON.parse(
    await downloadText(
      page.getByRole("button", {
        name: "Export configuration without secrets",
        exact: true,
      }),
    ),
  );
  assertMetadataOnly(configuration);
  assert.equal(
    configuration.providers.find((item) => item.id === providerId).rates
      .input_per_million,
    3,
  );
  await screenshot("settings");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Models", "History", "Usage", "Logs", "Settings"]) {
    await navigate(name);
    if (name === "History")
      await page.getByRole("tab", { name: "Requests", exact: true }).click();
    await until(
      async () =>
        (await page
          .locator('[aria-label="Loading operational data"]')
          .count()) === 0,
      "Operational view should load",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `${name} must not overflow the mobile viewport`,
    );
    await screenshot(`mobile-${name.toLowerCase()}`);
  }
  await page.setViewportSize({ width: 1440, height: 1060 });
  await api("/api/admin/settings", {
    method: "PATCH",
    data: { primary_provider_id: originalSettings.primary_provider_id },
  });
  await navigate("Models");
  await page
    .getByRole("button", { name: "Refresh administration", exact: true })
    .click();
  await card()
    .getByRole("button", { name: `Remove ${editedName}`, exact: true })
    .waitFor();
  await card()
    .getByRole("button", { name: `Remove ${editedName}`, exact: true })
    .click();
  await page.getByRole("dialog", { name: "Remove this provider?" }).waitFor();
  await page
    .getByRole("button", { name: "Keep provider", exact: true })
    .click();
  assert.ok(
    (await api("/api/admin")).providers.some((item) => item.id === providerId),
  );
  await card()
    .getByRole("button", { name: `Remove ${editedName}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove provider", exact: true })
    .click();
  await until(
    async () =>
      !(await api("/api/admin")).providers.some(
        (item) => item.id === providerId,
      ),
    "Removing a provider should persist",
  );
  assert.equal(
    (await api(`/api/interactions?provider_id=${providerId}&period=all`)).total,
    27,
    "Provider removal must preserve historical records",
  );
  providerId = null;
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log(
    "Console QA passed: provider create/edit/probe/rates/default/remove, secret-safe exports, real routed requests, history pagination/filter/detail/recovery, usage coverage, audit filters, retention/pause controls, deletion cancellation, five mobile views.",
  );
  console.log(`Screenshots saved in ${out}`);
} catch (error) {
  await screenshot("failure", false).catch(() => {});
  throw error;
} finally {
  if (originalSettings) {
    await api("/api/admin/settings", {
      method: "PATCH",
      data: originalSettings,
    }).catch(() => {});
  }
  if (providerId)
    await api(`/api/providers/${providerId}`, { method: "DELETE" }).catch(
      () => {},
    );
  // Recover a provider created before an interrupted browser response assigned its ID.
  if (originalSettings) {
    const administration = await api("/api/admin").catch(() => null);
    for (const profile of administration?.providers ?? []) {
      if ([syntheticName, editedName].includes(profile.label))
        await api(`/api/providers/${profile.id}`, { method: "DELETE" }).catch(
          () => {},
        );
    }
  }
  if (originalGreen !== null)
    await page
      .evaluate(
        (value) => localStorage.setItem("omni.green", value),
        originalGreen,
      )
      .catch(() => {});
  await browser.close();
}
