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
page.setDefaultTimeout(10000);
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
const capturedIds = [];
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
  await page.getByRole("button", { name: "Authorize 1 memory" }).click();
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
  // Follow-up requests carry complete prior exchanges to the actual local provider.
  const firstAssistant = await page
    .locator(".chat-entry.assistant .markdown-body")
    .innerText();
  const firstPrompt = "[QA synthetic] Summarize my design review preferences.";
  const followup = "[QA synthetic] Give me one practical example.";
  let transmittedHistory;
  await page.route("**/api/chat", async (route) => {
    transmittedHistory = route.request().postDataJSON().history;
    await route.continue();
  });
  await page.getByLabel("Your message").fill(followup);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .locator(".chat-entry.assistant")
    .nth(1)
    .waitFor({ timeout: 90000 });
  assert.equal(transmittedHistory.length, 2);
  assert.equal(transmittedHistory[0].content, firstPrompt);
  assert.ok(transmittedHistory[1].content.includes(firstAssistant.trim()));
  await page.unroute("**/api/chat");

  // A failed request keeps the draft and does not poison conversation history.
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "QA provider temporarily unavailable",
    }),
  );
  await page
    .getByLabel("Your message")
    .fill("[QA synthetic] Preserve this draft.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "QA provider temporarily unavailable" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Your message").inputValue(),
    "[QA synthetic] Preserve this draft.",
  );
  assert.equal(await page.locator(".chat-entry.assistant").count(), 2);
  await page.unroute("**/api/chat");

  // Rendering model output must not execute HTML or load remote image beacons.
  const markdown =
    "## QA formatted reply\n\n**Clear** instructions.\n\n```rust\nfn main() {}\n```\n\n| Step | Result |\n| --- | --- |\n| One | Ready |\n\n![tracking](https://qa-image.invalid/pixel)\n<script>window.qaUnsafe = true</script>";
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      json: { reply: markdown, model: "QA fixture", receipt_id: null },
    }),
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("heading", { name: "QA formatted reply" }).waitFor();
  assert.equal(await page.locator(".markdown-body table").count(), 1);
  assert.equal(await page.locator(".markdown-body pre code").count(), 1);
  assert.equal(await page.locator(".markdown-body img").count(), 0);
  assert.equal(await page.evaluate(() => window.qaUnsafe), undefined);
  await page.unroute("**/api/chat");
  await page.waitForTimeout(200);
  await page.screenshot({
    path: resolve(out, "conversation.png"),
    fullPage: true,
  });

  // Withdrawn context must not be replayed from an old assistant reply.
  await page.getByRole("button", { name: "Close launcher" }).click();
  await api(`/api/memories/${memoryId}`, {
    method: "PATCH",
    data: { content: memory + " Updated authority.", status: "disputed" },
  });
  await page.waitForTimeout(5500);
  await page.getByRole("button", { name: /Ask with context/ }).click();
  assert.equal(
    await page.locator(".chat-entry").count(),
    0,
    "Changing an authorized memory clears prior conversation context",
  );
  assert.equal(
    await page.getByRole("button", { name: "New conversation" }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Close launcher" }).click();
  await page
    .locator(`[data-grant-id="${grantId}"]`)
    .getByRole("button", { name: "Revoke access" })
    .click();
  await page
    .locator(`[data-grant-id="${grantId}"]`)
    .getByText("revoked", { exact: true })
    .waitFor();
  console.log(
    "UI session, conversation, rendering and permission checks passed.",
  );
  // Importing text creates reviewable proposals, never automatic authority.
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Memory", exact: true })
    .click();
  await page.getByRole("button", { name: "Import text" }).click();
  await page.getByLabel("Source title").fill("QA synthetic source");
  await page
    .getByLabel("Text to remember")
    .fill(
      "[QA synthetic] I prefer detailed implementation notes and short meetings.",
    );
  await page.getByRole("button", { name: "Extract for review" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 90000 });
  const captured = (await api("/api/state")).memories.filter(
    (entry) =>
      entry.source === "manual_capture" &&
      !state.memories.some((old) => old.id === entry.id),
  );
  assert.ok(captured.length > 0);
  capturedIds.push(...captured.map((entry) => entry.id));
  assert.ok(captured.every((entry) => entry.status === "proposed"));
  await page.locator(`[data-memory-id="${capturedIds[0]}"]`).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  assert.ok(
    (await api("/api/state")).memories.some(
      (entry) => entry.id === capturedIds[0],
    ),
    "First delete click must only ask for confirmation",
  );
  await page.getByRole("button", { name: "Keep memory" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await api("/api/state")).memories.some(
      (entry) => entry.id === capturedIds[0],
    ),
    false,
  );
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
  // Locking removes the in-memory conversation and drafts from the next session.
  await page.getByRole("button", { name: "Lock session" }).click();
  await page.getByLabel("Unlock your local session").waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("omni.token")),
    null,
  );
  await page.getByLabel("Unlock your local session").fill(token);
  await page.getByRole("button", { name: "Open my space" }).click();
  await page.getByRole("button", { name: /Ask with context/ }).click();
  assert.equal(await page.locator(".chat-entry").count(), 0);
  assert.equal(await page.getByLabel("Your message").inputValue(), "");
  await page.screenshot({
    path: resolve(out, "mobile-launcher.png"),
    fullPage: false,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log(
    "UI QA passed: session and lock isolation, memory create/edit/import/delete confirmation, scoped grant and withdrawal, contextual follow-up history, Markdown safety, failed-request recovery, receipt, revoke, all views, mobile overflow.",
  );
  console.log(`Screenshots saved in ${out}`);
} finally {
  for (const id of capturedIds)
    await api(`/api/memories/${id}`, { method: "DELETE" }).catch(() => {});
  if (grantId)
    await api(`/api/grants/${grantId}`, { method: "DELETE" }).catch(() => {});
  if (memoryId)
    await api(`/api/memories/${memoryId}`, { method: "DELETE" }).catch(
      () => {},
    );
  await browser.close();
}
