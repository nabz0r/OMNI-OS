#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const desktop = join(root, "apps/desktop");
const native = join(desktop, "src-tauri");
const require = createRequire(import.meta.url);
const platforms = ["macos", "windows", "linux", "android", "ios"];
const [platform, ...flags] = process.argv.slice(2);
const allowedFlags = ["--debug", "--init-only", "--smoke", "--dry-run"];
if (
  !platforms.includes(platform) ||
  flags.some((flag) => !allowedFlags.includes(flag))
) {
  console.error(
    "Usage: node scripts/build-platform.mjs <macos|windows|linux|android|ios> [--debug] [--init-only] [--smoke] [--dry-run]",
  );
  process.exit(1);
}
const mobile = platform === "android" || platform === "ios";
const debug = mobile || flags.includes("--debug");
const initOnly = flags.includes("--init-only");
const smoke = flags.includes("--smoke");
const dryRun = flags.includes("--dry-run");
if (initOnly && !mobile)
  throw new Error("--init-only applies to Android and iOS.");
if (smoke && (platform === "android" || initOnly))
  throw new Error(
    "--smoke supports desktop applications and the iOS simulator, after a build.",
  );
// Launching creates a real device vault. Restrict automatic launches to disposable CI hosts.
if (smoke && !dryRun && process.env.CI !== "true")
  throw new Error("--smoke is restricted to disposable CI hosts (CI=true).");
const host = {
  macos: "darwin",
  windows: "win32",
  linux: "linux",
  ios: "darwin",
}[platform];
if (!dryRun && host && process.platform !== host)
  throw new Error(`${platform} must be built on its native host (${host}).`);
if (!dryRun && platform === "ios" && process.arch !== "arm64")
  throw new Error(
    "This iOS build targets the arm64 simulator; use an Apple Silicon Mac.",
  );

const env = { ...process.env };
// Test artifacts never consume signing identities, certificates, or provisioning profiles.
for (const key of Object.keys(env)) {
  if (
    /^(APPLE_|IOS_CERTIFICATE|IOS_MOBILE_PROVISION|TAURI_SIGNING_|WINDOWS_CERTIFICATE)/.test(
      key,
    )
  )
    delete env[key];
}
const targetDir = resolve(
  env.CARGO_TARGET_DIR ||
    (/[\s']/.test(root)
      ? join(tmpdir(), `omni-native-target-${process.getuid?.() ?? "local"}`)
      : join(native, "target")),
);
env.CARGO_TARGET_DIR = targetDir;
const output = join(root, "artifacts/platforms", platform);
const cli = require.resolve("@tauri-apps/cli/tauri.js");
const config = JSON.parse(
  await readFile(join(native, "tauri.conf.json"), "utf8"),
);
const overlay = JSON.parse(
  await readFile(join(native, `tauri.${platform}.conf.json`), "utf8"),
);
const buildInfo = {
  platform,
  profile: debug ? "debug" : "release",
  created_at: new Date().toISOString(),
  status: "building",
  signing:
    platform === "android"
      ? "Android development debug key; not a release signature"
      : "No distribution signing or notarization",
  distribution:
    platform === "ios"
      ? "Apple Silicon iOS simulator only; not installable on an iPhone"
      : "Development evaluation; not a signed store release",
  runtime: "Embedded Rust core; no Node.js service bundled",
  smoke: { status: "not_run", scope: "No runtime claim from packaging alone" },
  artifacts: [],
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: desktop,
    env,
    stdio: "inherit",
    ...options,
  });
  if (result.error)
    throw new Error(
      `Unable to run ${basename(command)}: ${result.error.code || "launch failed"}`,
    );
  if (result.status !== 0)
    throw new Error(
      `${basename(command)} failed with exit code ${result.status ?? "unknown"}.`,
    );
  return result.stdout?.toString().trim() || "";
}

function tauri(args) {
  console.log(`Tauri: ${args.join(" ")}`);
  return run(process.execPath, [cli, ...args]);
}

async function walk(directory, match, skip = () => false) {
  if (!(await exists(directory))) return [];
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (match(entry)) found.push(path);
    else if (entry.isDirectory() && !skip(entry))
      found.push(...(await walk(path, match, skip)));
  }
  return found;
}

async function saveInfo() {
  await writeFile(
    join(output, "build-info.json"),
    `${JSON.stringify(buildInfo, null, 2)}\n`,
  );
}

async function recordArtifact(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  buildInfo.artifacts.push({
    file: basename(path),
    bytes: (await stat(path)).size,
    sha256: hash.digest("hex"),
  });
}

async function copyArtifact(path) {
  const destination = join(output, basename(path));
  await cp(path, destination);
  await recordArtifact(destination);
}

async function archiveApp(path, name) {
  const destination = join(output, name);
  run("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    path,
    destination,
  ]);
  await recordArtifact(destination);
}

async function prepareAndroid() {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk)
    throw new Error(
      "Set ANDROID_HOME to an installed Android SDK. See PLATFORMS.md.",
    );
  env.ANDROID_HOME = resolve(sdk);
  env.NDK_HOME ||= join(env.ANDROID_HOME, "ndk/28.2.13676358");
  env.ANDROID_NDK_HOME = env.NDK_HOME;
  for (const path of [
    join(sdk, "platforms/android-36"),
    join(sdk, "build-tools/36.0.0"),
    env.NDK_HOME,
  ]) {
    if (!(await exists(path)))
      throw new Error(
        `Required Android toolchain component is missing: ${path}. Install it through the SDK manager after reviewing its license.`,
      );
  }
  const revision = await readFile(
    join(env.NDK_HOME, "source.properties"),
    "utf8",
  );
  if (!/^Pkg.Revision\s*=\s*28\.2\.13676358\s*$/m.test(revision))
    throw new Error(
      "NDK_HOME must point to NDK 28.2.13676358 so Rust and Gradle use the same toolchain.",
    );
  const hostTag = {
    darwin: "darwin-x86_64",
    linux: "linux-x86_64",
    win32: "windows-x86_64",
  }[process.platform];
  if (!hostTag)
    throw new Error(
      "The selected host has no supported Android NDK toolchain.",
    );
  const bin = join(env.NDK_HOME, "toolchains/llvm/prebuilt", hostTag, "bin");
  const wrapper = process.platform === "win32" ? ".cmd" : "";
  const executable = process.platform === "win32" ? ".exe" : "";
  for (const target of ["aarch64-linux-android", "x86_64-linux-android"]) {
    const key = target.replaceAll("-", "_");
    const compiler = join(bin, `${target}24-clang${wrapper}`);
    if (!(await exists(compiler)))
      throw new Error(`The Android C compiler is missing for ${target}.`);
    env[`CC_${key}`] = compiler;
    env[`CXX_${key}`] = join(bin, `${target}24-clang++${wrapper}`);
    env[`AR_${key}`] = join(bin, `llvm-ar${executable}`);
    env[`CARGO_TARGET_${key.toUpperCase()}_LINKER`] = compiler;
  }
  run("java", ["-version"]);
  const project = join(native, "gen/android");
  if (!(await exists(join(project, "app/build.gradle.kts"))))
    tauri(["android", "init", "--ci", "--skip-targets-install"]);
  const manifestPath = join(project, "app/src/main/AndroidManifest.xml");
  let manifest = await readFile(manifestPath, "utf8");
  if (!/<application\b[^>]*>/.test(manifest))
    throw new Error(
      "The generated Android manifest has no application element.",
    );
  manifest = manifest.replace(/<application\b[^>]*>/, (tag) => {
    for (const [attribute, value] of Object.entries({
      "android:allowBackup": "false",
      "android:fullBackupContent": "false",
      "android:dataExtractionRules": "@xml/omni_data_extraction_rules",
    })) {
      const pattern = new RegExp(`\\s${attribute}=["'][^"']*["']`, "g");
      tag = tag
        .replace(pattern, "")
        .replace(/>$/, `\n        ${attribute}="${value}">`);
    }
    return tag;
  });
  await writeFile(manifestPath, manifest);
  const resources = join(project, "app/src/main/res");
  await mkdir(join(resources, "xml"), { recursive: true });
  const exclusions = [
    "root",
    "file",
    "database",
    "sharedpref",
    "external",
    "device_root",
    "device_file",
    "device_database",
    "device_sharedpref",
  ]
    .map((domain) => `    <exclude domain="${domain}" path="." />`)
    .join("\n");
  await writeFile(
    join(resources, "xml/omni_data_extraction_rules.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`,
  );
  // Keep SDK selection explicit; Gradle must not silently provision a different SDK or NDK.
  const gradlePath = join(project, "app/build.gradle.kts");
  let gradle = await readFile(gradlePath, "utf8");
  if (!/compileSdk\s*=/.test(gradle) || !/targetSdk\s*=/.test(gradle))
    throw new Error(
      "The Android project template changed; review SDK settings before building.",
    );
  gradle = gradle
    .replace(/compileSdk\s*=\s*[^\r\n]+/, "compileSdk = 36")
    .replace(/targetSdk\s*=\s*[^\r\n]+/, "targetSdk = 36")
    .replace(/^\s*(?:buildToolsVersion|ndkVersion)\s*=\s*[^\r\n]+/gm, "")
    .replace(
      /android\s*\{/,
      'android {\n    buildToolsVersion = "36.0.0"\n    ndkVersion = "28.2.13676358"',
    );
  await writeFile(gradlePath, gradle);
  await cp(join(native, "icons/android"), resources, { recursive: true });
  buildInfo.android = {
    min_sdk: overlay.bundle.android.minSdkVersion,
    target_sdk: 36,
    build_tools: "36.0.0",
    ndk: "28.2.13676358",
    backups: "Disabled; all cloud-backup and device-transfer domains excluded",
  };
  return project;
}

async function prepareIos() {
  run("xcodebuild", ["-version"]);
  run("pod", ["--version"]);
  const project = join(native, "gen/apple");
  if (!(await exists(join(project, "project.yml"))))
    tauri(["ios", "init", "--ci", "--skip-targets-install"]);
  const minimum = overlay.bundle.iOS.minimumSystemVersion;
  // Generated projects are ignored by Git. Keep existing generated deployment targets in sync.
  const projectFile = join(project, "project.yml");
  let yaml = await readFile(projectFile, "utf8");
  yaml = yaml
    .replace(/(\biOS:\s*)["']?\d+(?:\.\d+)*["']?/g, `$1"${minimum}"`)
    .replace(
      /(IPHONEOS_DEPLOYMENT_TARGET:\s*)["']?\d+(?:\.\d+)*["']?/g,
      `$1"${minimum}"`,
    );
  await writeFile(projectFile, yaml);
  for (const path of await walk(
    project,
    (entry) => entry.name === "project.pbxproj",
    (entry) => entry.name === "Pods" || entry.name === "build",
  )) {
    const value = await readFile(path, "utf8");
    await writeFile(
      path,
      value.replace(
        /(IPHONEOS_DEPLOYMENT_TARGET\s*=\s*)["']?\d+(?:\.\d+)*["']?;/g,
        `$1${minimum};`,
      ),
    );
  }
  await cp(
    join(native, "icons/ios"),
    join(project, "Assets.xcassets/AppIcon.appiconset"),
    { recursive: true },
  );
  buildInfo.ios = {
    minimum_system_version: minimum,
    target: "aarch64-apple-ios-sim",
    signing_identity: null,
    development_team: null,
  };
  return project;
}

async function smokeDesktop(binary) {
  const runtimeEnv = Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^(OMNI_|OPENAI_API_KEY$|ANTHROPIC_API_KEY$|TAURI_DEV_)/.test(key),
    ),
  );
  const log = createWriteStream(join(output, "smoke.log"));
  const child = spawn(binary, [], {
    cwd: output,
    env: runtimeEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let failure;
  const exited = new Promise((resolveExit) => {
    child.once("error", (error) => {
      failure = error.code || "launch failed";
      resolveExit();
    });
    child.once("exit", (code, signal) => {
      failure = `exit ${code ?? signal}`;
      resolveExit();
    });
  });
  try {
    await Promise.race([delay(12_000), exited]);
    if (failure)
      throw new Error(
        `Packaged application stopped during startup (${failure}); inspect smoke.log.`,
      );
    buildInfo.smoke = {
      status: "passed",
      scope:
        "Native process remained alive for 12 seconds; not an end-to-end UI or provider test",
    };
  } finally {
    child.kill("SIGTERM");
    await Promise.race([exited, delay(5_000)]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await new Promise((resolveLog) => log.end(resolveLog));
  }
}

async function smokeIos(app) {
  const devices = JSON.parse(
    run("xcrun", ["simctl", "list", "devices", "available", "--json"], {
      stdio: ["ignore", "pipe", "inherit"],
    }),
  ).devices;
  const candidates = Object.entries(devices)
    .filter(([runtime]) => /iOS-(?:1[89]|[2-9]\d)-/.test(runtime))
    .flatMap(([, entries]) => entries)
    .filter((device) => device.isAvailable && device.name.startsWith("iPhone"));
  const device =
    candidates.find((entry) => entry.state === "Booted") || candidates[0];
  if (!device)
    throw new Error(
      "No compatible iPhone simulator is installed. Install an iOS 18+ simulator runtime in Xcode.",
    );
  const bootedHere = device.state !== "Booted";
  if (bootedHere) run("xcrun", ["simctl", "boot", device.udid]);
  try {
    run("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
    run("xcrun", ["simctl", "install", device.udid, app]);
    run("xcrun", ["simctl", "launch", device.udid, config.identifier]);
    await delay(8_000);
    // A second launch returns an existing process; --terminate-running-process is deliberately absent.
    const result = run(
      "xcrun",
      ["simctl", "spawn", device.udid, "launchctl", "list"],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    if (
      !result
        .split("\n")
        .some((line) => /^\d+\s/.test(line) && line.includes(config.identifier))
    )
      throw new Error(
        "The simulator application did not remain running after launch.",
      );
    run("xcrun", [
      "simctl",
      "io",
      device.udid,
      "screenshot",
      join(output, "simulator.png"),
    ]);
    buildInfo.smoke = {
      status: "passed",
      scope:
        "Installed and launched on an iPhone simulator; process remained registered for 8 seconds; no physical-device or provider claim",
      device: device.name,
    };
  } finally {
    spawnSync(
      "xcrun",
      ["simctl", "terminate", device.udid, config.identifier],
      { env, stdio: "ignore" },
    );
    if (bootedHere)
      spawnSync("xcrun", ["simctl", "shutdown", device.udid], {
        env,
        stdio: "ignore",
      });
  }
}

async function build() {
  let project;
  if (platform === "android") project = await prepareAndroid();
  if (platform === "ios") project = await prepareIos();
  if (initOnly) {
    buildInfo.status = "initialized";
    return;
  }
  const cargoArgs = ["--", "--locked"];
  if (platform === "android") {
    tauri([
      "android",
      "build",
      "--ci",
      "--debug",
      "--apk",
      "--target",
      "aarch64",
      "--target",
      "x86_64",
      ...cargoArgs,
    ]);
    const apks = await walk(
      join(project, "app/build/outputs/apk"),
      (entry) => entry.name.endsWith(".apk") && entry.name.includes("debug"),
    );
    if (!apks.length)
      throw new Error("The Android build returned no debug APK.");
    const archiveEntries = apks
      .map((path) =>
        run("jar", ["tf", path], { stdio: ["ignore", "pipe", "inherit"] }),
      )
      .join("\n");
    for (const abi of ["arm64-v8a", "x86_64"])
      if (!archiveEntries.includes(`lib/${abi}/`))
        throw new Error(`The APK output is missing the ${abi} native runtime.`);
    for (const apk of apks) await copyArtifact(apk);
    buildInfo.android.abis_verified_in_apks = ["arm64-v8a", "x86_64"];
  } else if (platform === "ios") {
    tauri([
      "ios",
      "build",
      "--ci",
      "--debug",
      "--target",
      "aarch64-sim",
      "--no-sign",
      "--archive-only",
      ...cargoArgs,
    ]);
    const archives = await walk(
      join(project, "build"),
      (entry) => entry.isDirectory() && entry.name.endsWith(".xcarchive"),
    );
    if (!archives.length)
      throw new Error("The iOS build returned no simulator archive.");
    const archive = archives.sort()[0];
    const apps = await walk(
      join(archive, "Products/Applications"),
      (entry) => entry.isDirectory() && entry.name.endsWith(".app"),
    );
    if (apps.length !== 1)
      throw new Error(
        "Expected exactly one simulator application in the iOS archive.",
      );
    await archiveApp(apps[0], "OMNI-ios-arm64-simulator.app.zip");
    await archiveApp(archive, "OMNI-ios-arm64-simulator.xcarchive.zip");
    if (smoke) await smokeIos(apps[0]);
  } else {
    const hostVersion = run("rustc", ["-vV"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const target = hostVersion.match(/^host: (.+)$/m)?.[1];
    if (!target) throw new Error("Unable to determine the native Rust target.");
    buildInfo.target = target;
    tauri([
      "build",
      "--ci",
      "--no-sign",
      "--target",
      target,
      ...(debug ? ["--debug"] : []),
      ...cargoArgs,
    ]);
    const buildDir = join(targetDir, target, debug ? "debug" : "release");
    const bundleDir = join(buildDir, "bundle");
    const extensions = {
      macos: [".dmg"],
      windows: [".exe"],
      linux: [".deb", ".AppImage"],
    }[platform];
    const files = await walk(
      bundleDir,
      (entry) =>
        entry.isFile() &&
        extensions.some((extension) => entry.name.endsWith(extension)),
      (entry) => entry.name.endsWith(".app") || entry.name.endsWith(".AppDir"),
    );
    for (const extension of extensions)
      if (!files.some((path) => path.endsWith(extension)))
        throw new Error(`The build returned no ${extension} bundle.`);
    for (const path of files) await copyArtifact(path);
    let binary = join(
      buildDir,
      platform === "windows" ? "omni-desktop.exe" : "omni-desktop",
    );
    if (platform === "macos") {
      const apps = await walk(
        join(bundleDir, "macos"),
        (entry) => entry.isDirectory() && entry.name.endsWith(".app"),
      );
      if (apps.length !== 1)
        throw new Error("Expected exactly one macOS application bundle.");
      await archiveApp(apps[0], `OMNI-macos-${process.arch}.app.zip`);
      const executables = await readdir(join(apps[0], "Contents/MacOS"));
      if (executables.length !== 1)
        throw new Error(
          "Expected one executable in the macOS application bundle.",
        );
      binary = join(apps[0], "Contents/MacOS", executables[0]);
    }
    if (smoke) await smokeDesktop(binary);
  }
  buildInfo.status = "built";
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        platform,
        profile: buildInfo.profile,
        config: `apps/desktop/src-tauri/tauri.${platform}.conf.json`,
        generated_project: mobile
          ? `apps/desktop/src-tauri/gen/${platform === "ios" ? "apple" : "android"}`
          : null,
        output: `artifacts/platforms/${platform}`,
        signing: buildInfo.signing,
        distribution: buildInfo.distribution,
        init_only: initOnly,
        smoke,
      },
      null,
      2,
    ),
  );
} else {
  await mkdir(output, { recursive: true });
  // Remove only this script's previous artifacts, never generated projects or SDKs.
  for (const entry of await readdir(output))
    await rm(join(output, entry), { recursive: true, force: true });
  await saveInfo();
  try {
    await build();
    await saveInfo();
    console.log(
      `${buildInfo.status === "initialized" ? "Initialized" : "Built"} ${platform}. Evidence: artifacts/platforms/${platform}/build-info.json`,
    );
  } catch (error) {
    buildInfo.status = "failed";
    buildInfo.failure =
      error instanceof Error ? error.message : "Platform build failed.";
    await saveInfo();
    console.error(buildInfo.failure);
    process.exitCode = 1;
  }
}
