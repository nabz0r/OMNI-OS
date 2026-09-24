#!/usr/bin/env node
import assert from "node:assert/strict";
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
  check(
    "native_share_sheet",
    /ChooserActivity/.test(adb(["shell", "dumpsys", "activity", "activities"])),
  );
  // Close the chooser without selecting an external app or recipient.
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
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
