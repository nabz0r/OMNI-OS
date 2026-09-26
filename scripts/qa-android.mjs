#!/usr/bin/env node
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { _android } from "playwright";
import { smokeAndroid, validateInvocation } from "./smoke-android.mjs";
import { startMockProvider } from "./mock-providers.mjs";

// Exercises the installed APK, production IPC, Rust gateway and Android Keystore.
// Only the response model is synthetic; no app APIs or native commands are mocked.
const options = validateInvocation(process.argv.slice(2), process.env.CI);
const directory = dirname(options.output);
await mkdir(directory, { recursive: true });
const apkDigest = createHash("sha256")
  .update(await readFile(options.apk))
  .digest("hex");
await smokeAndroid({
  ...options,
  output: join(directory, "android-smoke.json"),
});
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const adbPath = sdk ? join(sdk, "platform-tools/adb") : "adb";
const adb = (args) =>
  execFileSync(adbPath, ["-s", options.serial, ...args], {
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  });
const packageId = "local.omni.desktop";
const preference =
  "SIM_CANARY_ANDROID_DELIVERY prefers concise project updates.";
const provider = await startMockProvider({
  port: 0,
  name: "Android acceptance fixture",
});
const port = new URL(provider.url).port;
let device, page;
const errors = [];
const report = {
  status: "running",
  started_at: new Date().toISOString(),
  apk_sha256: apkDigest,
  serial: options.serial,
  scope:
    "Installed Android APK on an emulator, actual WebView and native IPC, real encrypted vault and Keystore; synthetic response provider over ADB loopback forwarding. No physical-device or commercial-provider claim.",
  assertions: {},
};
const check = (name, value) => {
  assert.ok(value, name);
  report.assertions[name] = true;
};
async function attach() {
  device = (await _android.devices({ omitDriverInstall: true })).find(
    (entry) => entry.serial() === options.serial,
  );
  assert.ok(device, "The explicitly selected emulator must be connected");
  device.setDefaultTimeout(120000);
  page = await (await device.webView({ pkg: packageId })).page();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("button", { name: "Lock session", exact: true })
    .waitFor();
}
async function localApi(path) {
  return page.evaluate(async (path) => {
    const result = await window.__TAURI_INTERNALS__.invoke("core_request", {
      token: sessionStorage.getItem("omni.token"),
      method: "GET",
      path,
      body: null,
    });
    if (result.status !== 200) throw new Error("Native acceptance read failed");
    return JSON.parse(result.body);
  }, path);
}
try {
  adb(["reverse", `tcp:${port}`, `tcp:${port}`]);
  adb(["shell", "am", "start", "-W", "-n", `${packageId}/.MainActivity`]);
  await attach();
  const state = await localApi("/api/state");
  check(
    "fresh_vault",
    state.memories.length === 0 && state.grants.length === 0,
  );
  check(
    "android_native_runtime",
    await page.evaluate(
      () => document.documentElement.dataset.platform === "android",
    ),
  );
  const setup = page.getByRole("dialog", { name: "Make yourself at home." });
  await setup.waitFor();
  await page.screenshot({ path: join(directory, "android-setup.png") });
  await setup.getByRole("button", { name: "Add new", exact: true }).click();
  await setup
    .getByLabel("Connection name", { exact: true })
    .fill("Android acceptance fixture");
  await setup.locator(".setup-endpoint-settings > summary").click();
  await setup
    .getByLabel("API base URL", { exact: true })
    .fill(`${provider.url}/v1`);
  await setup
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await setup
    .getByLabel("Choose your model", { exact: true })
    .selectOption("omni-synthetic");
  check("catalog_without_inference", provider.observations.length === 0);
  await setup.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("A preference worth remembering").fill(preference);
  await page
    .getByRole("button", { name: "Save preference", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open your first conversation", exact: true })
    .click();
  await page
    .getByLabel("Your message", { exact: true })
    .fill("Synthetic Android acceptance: summarize a project update.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .locator(".chat-entry.assistant")
    .filter({ hasText: "Synthetic task completed." })
    .waitFor();
  check("native_inference", provider.observations.length === 1);
  check(
    "ungranted_memory_stays_private",
    provider.observations[0].memory_included === false,
  );
  await page.screenshot({ path: join(directory, "android-conversation.png") });
  await page
    .getByRole("button", { name: "Close launcher", exact: true })
    .click();
  const after = await localApi("/api/state");
  check(
    "memory_saved_without_grant",
    after.memories.some((item) => item.content === preference) &&
      after.grants.length === 0,
  );
  check("analytics_disabled", after.analytics.opt_in === false);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "History", exact: true })
    .click();
  await page.getByRole("button", { name: "JSON", exact: true }).waitFor();
  const history = await localApi("/api/interactions");
  check(
    "request_history_and_tokens",
    history.items.some(
      (item) => item.status === "succeeded" && item.output_tokens === 24,
    ),
  );
  await page.screenshot({ path: join(directory, "android-history.png") });
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await page
    .getByText("Choose a destination in the system share sheet.", {
      exact: true,
    })
    .waitFor();
  // A chooser can exist in the activity history before it receives focus.
  // Wait for the resumed activity before Back, or Android can close OMNI itself.
  async function resumedActivity(pattern) {
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      const activities = adb(["shell", "dumpsys", "activity", "activities"]);
      if (
        activities
          .split("\n")
          .some(
            (line) =>
              /(?:topResumedActivity|mResumedActivity)/.test(line) &&
              pattern.test(line),
          )
      )
        return true;
      await delay(150);
    }
    return false;
  }
  check("native_share_sheet", await resumedActivity(/ChooserActivity/));
  // Close the chooser without selecting an external app or recipient.
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  assert.ok(
    await resumedActivity(/local\.omni\.desktop\/.MainActivity/),
    "OMNI must resume after dismissing export",
  );
  const exported = adb([
    "exec-out",
    "run-as",
    packageId,
    "find",
    "cache/omni-exports",
    "-name",
    "*.json",
  ])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  check("native_export_written", exported.length === 1);
  const metadata = adb(["exec-out", "run-as", packageId, "cat", exported[0]]);
  check(
    "export_excludes_memory_and_prompt",
    !metadata.includes(preference) &&
      !metadata.includes("Synthetic Android acceptance:"),
  );
  check(
    "export_contains_history",
    JSON.parse(metadata).items.some((item) => item.status === "succeeded"),
  );
  const nav = (name) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
  await nav("Policies");
  await page.getByRole("heading", { name: "Build your rule chain." }).waitFor();
  // Set file types before opening the keyboard for regex editing.
  await page.getByLabel("Allow .csv files", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page
    .getByLabel("Rule 1 name", { exact: true })
    .fill("Block synthetic restricted content");
  await page.getByLabel("Rule 1 pattern", { exact: true }).fill("(");
  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "unsupported" }).waitFor();
  check(
    "invalid_regex_rejected",
    (await localApi("/api/policies")).revision === 0,
  );
  await page
    .getByLabel("Rule 1 pattern", { exact: true })
    .fill("(?i)RESTRICTED_ANDROID|classification\\s*:\\s*restricted");
  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Revision 1" }).waitFor();
  check(
    "native_policy_saved",
    (await localApi("/api/policies")).revision === 1,
  );
  await page
    .getByLabel("Policy sample", { exact: true })
    .fill("RESTRICTED_ANDROID");
  await page
    .getByRole("button", { name: "Test saved policy", exact: true })
    .click();
  await page.getByText("This sample is blocked.", { exact: true }).waitFor();
  check("policy_preview_stays_local", provider.observations.length === 1);
  await page.getByLabel("Policy sample", { exact: true }).fill("Public update");
  await page.getByLabel("Policy test files", { exact: true }).setInputFiles({
    name: "public.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("public,123"),
  });
  await page
    .getByRole("button", { name: "Test saved policy", exact: true })
    .click();
  await page.getByText("File type not allowed", { exact: true }).waitFor();
  check("native_file_type_policy", provider.observations.length === 1);
  check(
    "policy_no_horizontal_overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(directory, "android-policies.png") });
  await nav("Overview");
  await page.getByRole("button", { name: /Ask with context/ }).click();
  await page
    .getByLabel("Your message", { exact: true })
    .fill("RESTRICTED_ANDROID");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Request blocked" })
    .waitFor();
  check(
    "blocked_request_never_reaches_provider",
    provider.observations.length === 1,
  );
  await page
    .getByLabel("Your message", { exact: true })
    .fill("Summarize the attached public note.");
  const previousReplies = await page.locator(".chat-entry.assistant").count();
  await page.getByLabel("Attach text files", { exact: true }).setInputFiles({
    name: "public.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("A public project update."),
  });
  await page
    .getByRole("button", { name: "Remove attached file 1", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll(".chat-entry.assistant").length > count,
    previousReplies,
  );
  check("native_text_attachment_inference", provider.observations.length === 2);
  await page
    .getByRole("button", { name: "Close launcher", exact: true })
    .click();
  const decisions = await localApi("/api/policies/decisions");
  check(
    "policy_decision_metadata_only",
    decisions.blocked >= 1 &&
      !JSON.stringify(decisions).includes("RESTRICTED_ANDROID") &&
      !JSON.stringify(decisions).includes("public.txt"),
  );
  await nav("Memory");
  const importDialog = page.getByRole("dialog", {
    name: "Import text or conversations",
  });
  const conversation = (text) => ({
    format: "omni-conversations-v1",
    conversations: [
      {
        title: "Synthetic native import",
        messages: [
          { role: "user", content: text },
          {
            role: "assistant",
            content: "Unselected synthetic assistant reply.",
          },
        ],
      },
    ],
  });
  async function openImport(text) {
    await page
      .getByRole("button", { name: "Import text", exact: true })
      .click();
    await importDialog
      .getByRole("button", { name: "Import chats", exact: true })
      .click();
    await importDialog
      .getByLabel("Conversation JSON · up to 5 MB", { exact: true })
      .setInputFiles({
        name: "synthetic-conversation.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(conversation(text))),
      });
    const selector = importDialog.getByLabel(/Choose one conversation/);
    await selector.waitFor();
    check(
      "import_no_automatic_conversation_selection",
      (await selector.inputValue()) === "-1",
    );
    await selector.selectOption("0");
    check(
      "import_assistant_unselected",
      !(await importDialog
        .getByLabel("Message 2 · AI assistant", { exact: true })
        .isChecked()),
    );
  }
  const beforeImport = await localApi("/api/state");
  await openImport("SIM_CANARY_NATIVE_IMPORT: concise weekly updates.");
  await importDialog
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  check(
    "import_empty_selection_disabled",
    await importDialog
      .getByRole("button", { name: "Use selected messages", exact: true })
      .isDisabled(),
  );
  await importDialog
    .getByRole("button", { name: "Select user messages", exact: true })
    .click();
  check(
    "import_no_horizontal_overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(directory, "android-import.png") });
  await importDialog
    .getByRole("button", { name: "Use selected messages", exact: true })
    .click();
  const preview = await importDialog
    .getByLabel("Text to remember", { exact: true })
    .inputValue();
  check(
    "import_readable_review",
    preview.includes("User:") &&
      preview.includes("SIM_CANARY_NATIVE_IMPORT") &&
      !preview.includes("Unselected synthetic assistant"),
  );
  check(
    "import_review_does_not_save",
    (await localApi("/api/state")).memories.length ===
      beforeImport.memories.length,
  );
  await importDialog
    .getByRole("button", { name: "Extract for review", exact: true })
    .click();
  await importDialog.waitFor({ state: "hidden" });
  const imported = await localApi("/api/state");
  const proposed = imported.memories.filter(
    (item) => !beforeImport.memories.some((old) => old.id === item.id),
  );
  check(
    "import_native_proposed_memories",
    proposed.length > 0 && proposed.every((item) => item.status === "proposed"),
  );
  check(
    "import_does_not_grant_access",
    imported.grants.length === 0 && imported.receipts.length === 0,
  );
  await openImport("Classification:\nrestricted");
  await importDialog
    .getByRole("button", { name: "Use selected messages", exact: true })
    .click();
  await importDialog
    .getByRole("button", { name: "Extract for review", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Request blocked" })
    .waitFor();
  check(
    "import_decoded_policy_denial",
    (await localApi("/api/state")).memories.length ===
      imported.memories.length &&
      (await localApi("/api/policies/decisions")).blocked > decisions.blocked,
  );
  await importDialog
    .getByRole("button", { name: "Close import", exact: true })
    .click();
  await nav("Work");
  await page
    .getByRole("heading", { name: "Context with clear authority." })
    .waitFor();
  await page
    .getByLabel("Installation name", { exact: true })
    .fill("Synthetic Android work");
  await page
    .getByLabel(
      "This installation belongs to one OS user and is dedicated to work.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Enable work authority", exact: true })
    .click();
  await page.getByText("Enrolled", { exact: true }).waitFor();
  check(
    "work_single_owner_enrollment",
    (await localApi("/api/work")).authority === "per-device-single-owner",
  );
  await page
    .getByRole("button", { name: "Start local gateway", exact: true })
    .click();
  await page.getByText("Local gateway is open", { exact: true }).waitFor();
  check("work_explicit_native_gateway", true);
  await page
    .getByRole("button", { name: "Stop local gateway", exact: true })
    .click();
  await page.getByText("Local gateway is closed", { exact: true }).waitFor();
  check("work_native_gateway_stopped", true);
  await page
    .getByLabel("Client name", { exact: true })
    .fill("Synthetic Android client");
  await page
    .getByLabel("Destination", { exact: true })
    .selectOption(`${provider.url}/v1`);
  await page
    .getByRole("button", { name: "Approve client", exact: true })
    .click();
  await page
    .getByText("Save this client credential now", { exact: true })
    .waitFor();
  check(
    "work_client_credential_shown_once",
    (await localApi("/api/work")).clients.length === 1,
  );
  await page
    .getByRole("button", { name: "I have stored it securely", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revoke client", exact: true })
    .click();
  await page
    .getByText("Client and its permissions revoked for future requests.", {
      exact: true,
    })
    .waitFor();
  check(
    "work_client_revoked",
    !!(await localApi("/api/work")).clients[0].revoked_at,
  );
  await page
    .getByText("Start an opted-in conversation", { exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Synthetic continuity");
  await page
    .getByLabel("Project or purpose", { exact: true })
    .fill("Synthetic Android acceptance");
  const workProvider = (await localApi("/api/admin")).providers.find(
    (p) => p.label === "Android acceptance fixture",
  );
  await page
    .getByLabel("Provider", { exact: true })
    .selectOption(workProvider.id);
  await page
    .getByLabel("Store the text of this conversation", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Create conversation", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Synthetic continuity", exact: true })
    .waitFor();
  const savedId = (await localApi("/api/conversations")).conversations[0].id;
  check("continuity_explicit_consent", !!savedId);
  await page
    .getByLabel("Message", { exact: true })
    .fill("Synthetic human statement: keep this project concise.");
  await page
    .getByRole("button", { name: "Send and save", exact: true })
    .click();
  await page
    .getByText("Reply saved with its original roles.", { exact: true })
    .waitFor();
  const savedThread = await localApi(`/api/conversations/${savedId}`);
  check(
    "continuity_native_saved_roles",
    savedThread.turns[0].human_statement.includes(
      "Synthetic human statement",
    ) &&
      savedThread.turns[0].model_suggestion.includes(
        "Synthetic task completed",
      ),
  );
  check(
    "work_no_horizontal_overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(directory, "android-work.png") });
  await page
    .getByRole("button", {
      name: "Delete conversation Synthetic continuity",
      exact: true,
    })
    .click();
  await page
    .getByText("Conversation deleted from this vault.", { exact: false })
    .waitFor();
  check(
    "continuity_native_deleted",
    (await localApi("/api/conversations")).conversations.length === 0,
  );
  await page.getByRole("button", { name: "Lock session", exact: true }).click();
  await page
    .getByRole("button", { name: "Unlock on this device", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Unlock on this device", exact: true })
    .waitFor();
  check(
    "interface_lock_survives_reload",
    await page.evaluate(() => sessionStorage.getItem("omni.token") === null),
  );
  await page
    .getByRole("button", { name: "Unlock on this device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lock session", exact: true })
    .waitFor();
  check(
    "no_horizontal_overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await device.close();
  device = null;
  adb(["shell", "am", "force-stop", packageId]);
  adb(["shell", "am", "start", "-W", "-n", `${packageId}/.MainActivity`]);
  await attach();
  const restored = await localApi("/api/state");
  check(
    "memory_survives_process_restart",
    restored.memories.some((item) => item.content === preference),
  );
  check(
    "import_survives_process_restart",
    proposed.every((item) =>
      restored.memories.some(
        (saved) => saved.id === item.id && saved.status === "proposed",
      ),
    ),
  );
  check(
    "history_survives_process_restart",
    (await localApi("/api/interactions")).items.some(
      (item) => item.status === "succeeded",
    ),
  );
  check(
    "profile_survives_process_restart",
    (await localApi("/api/admin")).providers.some(
      (item) =>
        item.label === "Android acceptance fixture" &&
        item.model === "omni-synthetic",
    ),
  );
  check(
    "policy_survives_process_restart",
    (await localApi("/api/policies")).revision === 1,
  );
  check(
    "policy_decisions_survive_process_restart",
    (await localApi("/api/policies/decisions")).blocked >= 1,
  );
  check("no_webview_errors", errors.length === 0);
  await page.screenshot({ path: join(directory, "android-reopened.png") });
  report.status = "passed";
  console.log(
    `Android native acceptance passed: ${Object.keys(report.assertions).length} checks.`,
  );
} catch (error) {
  report.status = "failed";
  await page
    ?.screenshot({ path: join(directory, "android-failure.png") })
    .catch(() => {});
  throw error;
} finally {
  report.finished_at = new Date().toISOString();
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  await device?.close();
  try {
    adb(["reverse", "--remove", `tcp:${port}`]);
  } catch {}
  try {
    adb(["shell", "am", "force-stop", packageId]);
  } catch {}
  await provider.close();
}
