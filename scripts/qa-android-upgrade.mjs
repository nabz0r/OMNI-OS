#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { _android } from "playwright";
import { validateInvocation } from "./smoke-android.mjs";

// The caller supplies a previous APK plus the ordinary disposable-emulator flags.
const [previous, ...flags] = process.argv.slice(2);
assert.ok(
  previous?.endsWith(".apk"),
  "Supply the previous APK before --serial, --apk and --output.",
);
const options = validateInvocation(flags, process.env.CI);
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
assert.ok(sdk, "ANDROID_HOME is required.");
const pkg = "local.omni.desktop";
const adb = (...args) =>
  execFileSync(
    join(sdk, "platform-tools/adb"),
    ["-s", options.serial, ...args],
    { encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] },
  );
assert.equal(adb("shell", "getprop", "ro.kernel.qemu").trim(), "1");
assert.ok(
  !adb("shell", "pm", "list", "packages", pkg).includes(pkg),
  "Use an emulator with no OMNI installation; existing data is never removed.",
);
const digest = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const certificate = (path) =>
  execFileSync(
    join(sdk, "build-tools/36.0.0/apksigner"),
    ["verify", "--print-certs", resolve(path)],
    { encoding: "utf8" },
  ).match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/)?.[1];
const oldCert = certificate(previous),
  newCert = certificate(options.apk);
assert.match(oldCert || "", /^[a-f0-9]{64}$/);
assert.equal(
  newCert,
  oldCert,
  "An in-place update requires the same signing identity.",
);
const report = {
  status: "running",
  serial: options.serial,
  started_at: new Date().toISOString(),
  from_apk_sha256: await digest(previous),
  to_apk_sha256: await digest(options.apk),
  certificate_sha256: newCert,
  scope:
    "Synthetic fresh vault on a disposable Android emulator, updated in place with adb install -r; no personal data or physical-device claim.",
  assertions: {},
};
let device, page;
const check = (name, value) => {
  assert.ok(value, name);
  report.assertions[name] = true;
};
async function attach() {
  const connected = await _android.devices({ omitDriverInstall: true });
  device = connected.find((entry) => entry.serial() === options.serial);
  // Enumeration opens transports for every emulator; close unused handles.
  await Promise.all(
    connected.filter((entry) => entry !== device).map((entry) => entry.close()),
  );
  assert.ok(device);
  device.setDefaultTimeout(120000);
  page = await (await device.webView({ pkg })).page();
  await page
    .getByRole("button", { name: "Lock session", exact: true })
    .waitFor({ timeout: 120000 });
}
async function api(path, method = "GET", body = null) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const r = await window.__TAURI_INTERNALS__.invoke("core_request", {
        token: sessionStorage.getItem("omni.token"),
        method,
        path,
        body: body === null ? null : JSON.stringify(body),
      });
      if (r.status !== 200)
        throw new Error("Native upgrade verification failed.");
      return JSON.parse(r.body);
    },
    { path, method, body },
  );
}
try {
  check("same_signing_identity", oldCert === newCert);
  check(
    "previous_installed",
    /Success/.test(adb("install", "-t", resolve(previous))),
  );
  adb("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  await attach();
  const memory = await api("/api/memories", "POST", {
    content: "SIM_CANARY_UPGRADE: retain this synthetic memory.",
    status: "confirmed",
    source: "manual",
  });
  await api("/api/admin/settings", "PATCH", { history_retention_days: 17 });
  await device.close();
  device = null;
  adb("shell", "am", "force-stop", pkg);
  check(
    "update_without_uninstall",
    /Success/.test(adb("install", "-r", "-t", options.apk)),
  );
  adb("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  await attach();
  check(
    "original_memory_preserved",
    (await api("/api/state")).memories.some(
      (item) => item.id === memory.id && item.content === memory.content,
    ),
  );
  check(
    "original_settings_preserved",
    (await api("/api/admin")).settings.history_retention_days === 17,
  );
  check("policy_schema_migrated", (await api("/api/policies")).revision === 0);
  const skip = page.getByRole("button", { name: "Skip setup", exact: true });
  if (await skip.isVisible()) await skip.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Policies", exact: true })
    .click();
  await page.getByRole("heading", { name: "Build your rule chain." }).waitFor();
  check("new_policy_console_available", true);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Work", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Context with clear authority." })
    .waitFor();
  check(
    "work_upgrade_without_implicit_enrollment",
    (await api("/api/work")).enabled === false,
  );
  check(
    "continuity_upgrade_without_implicit_consent",
    (await api("/api/conversations")).conversations.length === 0,
  );
  report.status = "passed";
  console.log(
    `Android in-place upgrade passed: ${Object.keys(report.assertions).length} checks.`,
  );
} catch (error) {
  report.status = "failed";
  throw error;
} finally {
  await device?.close();
  adb("shell", "am", "force-stop", pkg);
  report.finished_at = new Date().toISOString();
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(report, null, 2) + "\n");
}
