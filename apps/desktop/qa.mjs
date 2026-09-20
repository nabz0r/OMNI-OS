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
const out = resolve(here, "artifacts");
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
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const api = async (path, options = {}) => {
  const response = await page.request.fetch(`http://127.0.0.1:3007${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok())
    throw new Error(`QA core request failed ${response.status()}`);
  return response.status() === 204 ? null : response.json();
};
let memoryId = null,
  grantId = null;
try {
  await page.goto("http://127.0.0.1:3006");
  await page.getByLabel("Unlock your local session").fill(token);
  await page.getByRole("button", { name: "Open my space" }).click();
  await page.getByRole("heading", { name: "Your constellation" }).waitFor();
  const state = await api("/api/state");
  if (process.env.OMNI_QA_VIEW_ONLY !== "1")
    assert.equal(
      state.stats?.simulation,
      true,
      "Mutation QA requires the isolated --simulate stack.",
    );
  if (state.stats?.simulation || state.simulation)
    await page.getByText(/SYNTHETIC DEMONSTRATION/).waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(out, "overview.png"), fullPage: true });
  if (process.env.OMNI_QA_VIEW_ONLY === "1") {
    for (const [label, file] of [
      ["Memory", "memory"],
      ["Permissions", "permissions"],
      ["Activity", "activity"],
      ["Collective", "collective"],
      ["Connections", "connections"],
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: label, exact: true })
        .click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: resolve(out, `${file}.png`),
        fullPage: true,
      });
    }
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await page.setViewportSize({ width: 430, height: 932 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, "mobile.png"), fullPage: true });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log("Read-only screenshot verification passed.");
    await browser.close();
    process.exit(0);
  }
  await page.getByRole("button", { name: "Add a memory", exact: true }).click();
  const memory =
    "[QA synthetic] I prefer concise design reviews with explicit sources.";
  await page.getByLabel("Memory content").fill(memory);
  await page.getByRole("button", { name: "Save to my vault" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  memoryId = (await api("/api/state")).memories.find(
    (m) => m.content === memory,
  )?.id;
  assert.ok(memoryId);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Memory/ })
    .click();
  await page.locator(`[data-memory-id="${memoryId}"]`).click();
  await page
    .getByLabel("Memory content")
    .fill(memory + " Keep my private notes local.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.screenshot({ path: resolve(out, "memory.png"), fullPage: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Permissions" })
    .click();
  await page.getByRole("button", { name: "Create permission" }).click();
  await page.getByRole("checkbox", { name: /\[QA synthetic\]/ }).check();
  await page.getByRole("button", { name: "Authorize 1 memories" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  grantId = (await api("/api/state")).grants.find(
    (g) => g.scope.includes(memoryId) && !g.revoked_at,
  )?.id;
  assert.ok(grantId);
  await page.screenshot({
    path: resolve(out, "permissions.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Ask with context/ }).click();
  await page.getByLabel("Permission for context").selectOption(grantId);
  await page
    .getByLabel("Your message")
    .fill("[QA synthetic] Summarize my design review preferences.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".chat-entry.assistant").waitFor({ timeout: 90000 });
  const after = await api("/api/state");
  assert.ok(after.receipts.some((r) => r.memory_ids.includes(memoryId)));
  await page.screenshot({
    path: resolve(out, "context-request.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close launcher" }).click();
  await page
    .locator(`[data-grant-id="${grantId}"]`)
    .getByRole("button", { name: "Revoke access" })
    .click();
  await page
    .locator(`[data-grant-id="${grantId}"]`)
    .getByText("revoked", { exact: true })
    .waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Activity" })
    .click();
  await page.screenshot({ path: resolve(out, "activity.png"), fullPage: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Collective" })
    .click();
  await page.getByRole("heading", { name: "Published aggregate" }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(out, "collective.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Connections" })
    .click();
  await page
    .getByRole("heading", { name: "WireGuard packet simulation" })
    .waitFor();
  await page.screenshot({
    path: resolve(out, "connections.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview" })
    .click();
  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(300);
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.screenshot({ path: resolve(out, "mobile.png"), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(
    overflow,
    false,
    "Mobile viewport must not horizontally overflow",
  );
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log(
    "UI QA passed: session, memory create/edit, scoped grant, contextual request, disclosure receipt, revoke, activity, collective, connections, mobile overflow.",
  );
  console.log(`Screenshots saved in ${out}`);
} finally {
  if (grantId)
    await api(`/api/grants/${grantId}`, { method: "DELETE" }).catch(() => {});
  if (memoryId)
    await api(`/api/memories/${memoryId}`, { method: "DELETE" }).catch(
      () => {},
    );
  await browser.close();
}
