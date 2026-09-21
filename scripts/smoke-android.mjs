#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execute = promisify(execFile);
const PACKAGE = "local.omni.desktop";
const ACTIVITY = `${PACKAGE}/.MainActivity`;
const DATABASE = "vault-v1/vault.db";
const WAL = `${DATABASE}-wal`;

export function validateInvocation(args, ci) {
  const allowed = new Set(["--serial", "--apk", "--output"]);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!allowed.has(name) || !value || value.startsWith("--") || values[name])
      throw new Error(
        "Usage: smoke-android.mjs --serial emulator-N --apk file.apk [--output report.json]",
      );
    values[name] = value;
  }
  if (ci !== "true")
    throw new Error(
      "Android smoke testing is restricted to disposable CI environments (CI=true).",
    );
  if (!/^emulator-\d+$/.test(values["--serial"] || ""))
    throw new Error(
      "An explicit disposable emulator serial is required; physical devices are refused.",
    );
  if (!values["--apk"]?.endsWith(".apk"))
    throw new Error("An explicit debug APK file is required.");
  return {
    serial: values["--serial"],
    apk: resolve(values["--apk"]),
    output: resolve(
      values["--output"] || "artifacts/platforms/android/android-smoke.json",
    ),
  };
}

export function encryptedHeader(header, size) {
  return (
    Number.isSafeInteger(size) &&
    size >= 4096 &&
    header.length === 16 &&
    !header.equals(Buffer.from("SQLite format 3\0")) &&
    !header.every((byte) => byte === 0)
  );
}

export function restartedVault(previous, current) {
  return (
    encryptedHeader(current.header, current.size) &&
    previous.header.equals(current.header) &&
    (previous.databaseDigest !== current.databaseDigest ||
      previous.walDigest !== current.walDigest)
  );
}

export async function smokeAndroid(options) {
  const apk = await stat(options.apk);
  if (!apk.isFile() || apk.size === 0)
    throw new Error("The supplied APK is not a nonempty regular file.");
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const executable = sdk
    ? join(
        sdk,
        "platform-tools",
        process.platform === "win32" ? "adb.exe" : "adb",
      )
    : "adb";
  let stage = "boot";
  let installed = false;
  const report = {
    status: "running",
    started_at: new Date().toISOString(),
    package: PACKAGE,
    serial: options.serial,
    scope:
      "Disposable Android emulator startup and encrypted-vault reopening; no provider request, UI interaction, physical-device or share-sheet claim",
    assertions: {},
  };
  const adb = async (args, { optional = false, timeout = 15000 } = {}) => {
    try {
      return (
        await execute(executable, ["-s", options.serial, ...args], {
          encoding: "buffer",
          timeout,
          maxBuffer: 1024 * 1024,
        })
      ).stdout;
    } catch {
      if (optional) return null;
      // ADB/native error output may contain application data. Never persist it.
      throw new Error(`Android command failed during ${stage}.`);
    }
  };
  const until = async (check, timeout, failure) => {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      const value = await check();
      if (value) return value;
      await delay(1000);
    }
    throw new Error(failure);
  };
  const digest = async (path, optional = false) => {
    const bytes = await adb(
      ["exec-out", "run-as", PACKAGE, "sha256sum", path],
      { optional },
    );
    if (bytes === null) return null;
    const match = bytes.toString("utf8").match(/^([a-f0-9]{64})\s/);
    if (!match)
      throw new Error(
        "The emulator returned an invalid encrypted-file digest.",
      );
    return match[1];
  };
  const snapshot = async () => {
    const sizeText = await adb(
      ["exec-out", "run-as", PACKAGE, "stat", "-c", "%s", DATABASE],
      { optional: true },
    );
    if (!sizeText) return null;
    const size = Number(sizeText.toString("utf8").trim());
    const header = await adb(
      ["exec-out", "run-as", PACKAGE, "head", "-c", "16", DATABASE],
      { optional: true },
    );
    if (!header || !encryptedHeader(header, size)) return null;
    return {
      size,
      header,
      databaseDigest: await digest(DATABASE),
      walDigest: await digest(WAL, true),
    };
  };
  const launch = async () => {
    const result = await adb(["shell", "am", "start", "-W", "-n", ACTIVITY], {
      timeout: 30000,
    });
    if (!/Status:\s*ok/.test(result.toString("utf8")))
      throw new Error(
        "The Android activity did not report a successful launch.",
      );
  };
  try {
    await until(
      async () => {
        const output = await adb(["shell", "getprop", "sys.boot_completed"], {
          optional: true,
        });
        return output?.toString("utf8").trim() === "1";
      },
      240000,
      "The disposable Android emulator did not finish booting within four minutes.",
    );
    const qemu = (await adb(["shell", "getprop", "ro.kernel.qemu"]))
      .toString("utf8")
      .trim();
    if (qemu !== "1")
      throw new Error(
        "The selected serial is not a verified Android emulator.",
      );
    report.assertions.disposable_emulator = true;
    stage = "fresh installation check";
    const existing = await adb(["shell", "pm", "path", PACKAGE], {
      optional: true,
    });
    if (existing?.toString("utf8").includes("package:"))
      throw new Error(
        "OMNI is already installed on this emulator; existing application data was left untouched.",
      );
    report.assertions.fresh_installation = true;
    stage = "APK installation";
    const installation = await adb(["install", "-t", options.apk], {
      timeout: 120000,
    });
    if (!/Success/.test(installation.toString("utf8")))
      throw new Error("The debug APK installation did not succeed.");
    installed = true;
    stage = "first native startup";
    await launch();
    const first = await until(
      snapshot,
      60000,
      "Native startup did not create an encrypted vault within one minute.",
    );
    report.assertions.encrypted_vault_created = true;
    report.vault = {
      bytes: first.size,
      header_bytes_examined: 16,
      plain_sqlite_header: false,
    };
    stage = "native restart";
    await adb(["shell", "am", "force-stop", PACKAGE]);
    const stopped = await snapshot();
    if (!stopped)
      throw new Error(
        "The encrypted vault disappeared when the application stopped.",
      );
    await launch();
    await until(
      async () => {
        const current = await snapshot();
        const running = await adb(["shell", "pidof", PACKAGE], {
          optional: true,
        });
        return (
          current &&
          running?.toString("utf8").trim() &&
          restartedVault(stopped, current)
        );
      },
      60000,
      "Reopening did not produce a new database write with the original encrypted vault.",
    );
    report.assertions.same_vault_salt_after_restart = true;
    report.assertions.database_write_after_restart = true;
    report.assertions.process_running_after_restart = true;
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.failed_stage = stage;
    report.error =
      error instanceof Error ? error.message : "Android smoke testing failed.";
    throw error;
  } finally {
    if (installed)
      await adb(["shell", "am", "force-stop", PACKAGE], { optional: true });
    report.finished_at = new Date().toISOString();
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const options = validateInvocation(process.argv.slice(2), process.env.CI);
    const result = await smokeAndroid(options);
    console.log(
      `Android emulator smoke: ${result.status}. Report: ${options.output}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Android smoke testing failed.",
    );
    process.exitCode = 1;
  }
}
