#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const allowed = new Set([
  "--macos",
  "--android",
  "--evidence",
  "--macos-revision",
  "--android-revision",
  "--macos-run",
  "--previous-delivery",
]);
const args = process.argv.slice(2),
  values = {};
for (let i = 0; i < args.length; i += 2) {
  assert.ok(
    allowed.has(args[i]) && args[i + 1] && !values[args[i]],
    "Expected unique named delivery inputs",
  );
  values[args[i]] = args[i + 1];
}
for (const key of allowed) assert.ok(values[key], `Missing ${key}`);
for (const key of ["--macos-revision", "--android-revision"])
  assert.match(
    values[key],
    /^[a-f0-9]{40}$/,
    "Use the complete source revision from each build",
  );
assert.match(
  values["--macos-run"],
  /^https:\/\/github\.com\/nabz0r\/OMNI-OS\/actions\/runs\/\d+$/,
);
assert.equal(
  process.platform,
  "darwin",
  "Assemble on macOS to verify the app seal and disk image",
);
const mac = resolve(values["--macos"]),
  android = resolve(values["--android"]),
  evidence = resolve(values["--evidence"]);
const version = JSON.parse(
  await readFile(join(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
).version;
assert.match(version, /^\d+\.\d+\.\d+$/);
const destination = join(root, `deliverables/OMNI-${version}-mvp`);
const stage = `${destination}.assembling-${process.pid}`;
try {
  await stat(destination);
  throw new Error(
    "The delivery folder already exists; preserve it and choose a new release before replacing anything.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function verifyInput(directory, metadata, name) {
  const artifact = metadata.artifacts.find((entry) => entry.file === name);
  assert.ok(artifact, `Missing build record for ${name}`);
  const path = join(directory, name);
  assert.equal(
    (await stat(path)).size,
    artifact.bytes,
    `Unexpected size for ${name}`,
  );
  assert.equal(
    await digest(path),
    artifact.sha256,
    `Build hash mismatch for ${name}`,
  );
  return artifact;
}
const macBuild = await json(join(mac, "build-info.json"));
const androidBuild = await json(join(android, "build-info.json"));
const acceptance = await json(join(evidence, "android-native-acceptance.json"));
const keystore = await json(join(evidence, "android-keystore-tests.json"));
const smoke = await json(join(evidence, "android-smoke.json"));
const upgrade = await json(join(evidence, "android-upgrade.json"));
const previousDirectory = resolve(values["--previous-delivery"]);
const previous = await json(join(previousDirectory, "delivery.json"));
assert.match(previous.version, /^\d+\.\d+\.\d+$/);
const previousApk = previous.packages.find((entry) =>
  entry.file.endsWith(".apk"),
);
assert.ok(previousApk, "The previous delivery must identify its Android APK");
assert.equal(previousApk.sha256, upgrade.from_apk_sha256);
assert.equal(
  await digest(join(previousDirectory, previousApk.file)),
  upgrade.from_apk_sha256,
);
assert.equal(macBuild.platform, "macos");
assert.equal(macBuild.target, "aarch64-apple-darwin");
assert.equal(macBuild.status, "built");
assert.equal(
  macBuild.smoke.status,
  "passed",
  "A macOS startup test is required",
);
assert.ok(
  macBuild.integrity?.application_signature,
  "The macOS bundle needs an evaluated resource seal",
);
for (const [build, revision] of [
  [macBuild, values["--macos-revision"]],
  [androidBuild, values["--android-revision"]],
]) {
  assert.equal(
    build.version,
    version,
    "The build version must match the delivery",
  );
  assert.equal(
    build.source_revision,
    revision,
    "The declared source must match build provenance",
  );
  assert.equal(
    build.source_dirty,
    false,
    "Release builds must come from clean source",
  );
}
assert.equal(
  values["--macos-revision"],
  values["--android-revision"],
  "Both platforms must use the same release source",
);
assert.equal(androidBuild.platform, "android");
assert.equal(androidBuild.status, "built");
assert.equal(acceptance.status, "passed");
assert.ok(
  Object.keys(acceptance.assertions).length >= 38 &&
    Object.values(acceptance.assertions).every((x) => x === true),
);
for (const name of [
  "native_policy_saved",
  "native_file_type_policy",
  "blocked_request_never_reaches_provider",
  "native_text_attachment_inference",
  "policy_survives_process_restart",
  "import_assistant_unselected",
  "import_review_does_not_save",
  "import_native_proposed_memories",
  "import_does_not_grant_access",
  "import_decoded_policy_denial",
  "import_survives_process_restart",
])
  assert.equal(
    acceptance.assertions[name],
    true,
    `Missing release check: ${name}`,
  );
assert.equal(smoke.status, "passed");
assert.equal(keystore.status, "passed");
assert.equal(keystore.tests, 5);
const apk = await verifyInput(android, androidBuild, "app-universal-debug.apk");
assert.equal(
  acceptance.apk_sha256,
  apk.sha256,
  "Android acceptance must cover the exact APK being delivered",
);
assert.equal(upgrade.status, "passed");
assert.equal(
  upgrade.to_apk_sha256,
  apk.sha256,
  "Upgrade evidence must cover the delivered APK",
);
for (const name of [
  "same_signing_identity",
  "update_without_uninstall",
  "original_memory_preserved",
  "original_settings_preserved",
  "policy_schema_migrated",
  "new_policy_console_available",
])
  assert.equal(
    upgrade.assertions[name],
    true,
    `Missing upgrade check: ${name}`,
  );
await verifyInput(mac, macBuild, `OMNI_${version}_aarch64.dmg`);
await verifyInput(mac, macBuild, "OMNI-macos-arm64.app.zip");
const run = (command, args) => execFileSync(command, args, { stdio: "pipe" });
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
assert.ok(sdk, "Set ANDROID_HOME to verify the APK signature before assembly");
run(join(sdk, "build-tools/36.0.0/apksigner"), [
  "verify",
  join(android, apk.file),
]);
try {
  for (const folder of ["macOS", "Android", "Evidence"])
    await mkdir(join(stage, folder), { recursive: true });
  const files = [
    [
      join(mac, `OMNI_${version}_aarch64.dmg`),
      `macOS/OMNI-${version}-macOS-arm64.dmg`,
    ],
    [
      join(mac, "OMNI-macos-arm64.app.zip"),
      `macOS/OMNI-${version}-macOS-arm64.app.zip`,
    ],
    [join(android, apk.file), `Android/OMNI-${version}-android.apk`],
    [join(mac, "build-info.json"), "Evidence/macos-build.json"],
    [join(android, "build-info.json"), "Evidence/android-build.json"],
    [join(root, "LICENSE"), "LICENSE"],
  ];
  for (const name of ["README.md", "START-HERE.html"])
    files.push([join(import.meta.dirname, "delivery", name), name]);
  for (const name of [
    "android-native-acceptance.json",
    "android-keystore-tests.json",
    "android-smoke.json",
    "android-apk-signature.txt",
    "android-setup.png",
    "android-conversation.png",
    "android-history.png",
    "android-reopened.png",
    "android-policies.png",
    "android-upgrade.json",
    "android-import.png",
    "android-keystore-junit.xml",
    "android-package.txt",
  ])
    files.push([join(evidence, name), `Evidence/${name}`]);
  for (const [source, target] of files)
    await cp(source, join(stage, target), { errorOnExist: true, force: false });
  for (const name of ["README.md", "START-HERE.html"])
    await writeFile(
      join(stage, name),
      (await readFile(join(stage, name), "utf8"))
        .replaceAll("{{VERSION}}", version)
        .replaceAll(
          "{{ANDROID_CHECKS}}",
          String(Object.keys(acceptance.assertions).length),
        )
        .replaceAll("{{PREVIOUS_VERSION}}", previous.version),
    );
  const sourceArchive = `OMNI-${version}-source.zip`;
  run("git", [
    "archive",
    "--format=zip",
    "--output",
    join(stage, sourceArchive),
    values["--macos-revision"],
  ]);
  run("ditto", [
    "-x",
    "-k",
    join(stage, `macOS/OMNI-${version}-macOS-arm64.app.zip`),
    join(stage, "macOS"),
  ]);
  run("codesign", [
    "--verify",
    "--deep",
    "--strict",
    join(stage, "macOS/OMNI.app"),
  ]);
  run("hdiutil", [
    "verify",
    join(stage, `macOS/OMNI-${version}-macOS-arm64.dmg`),
  ]);
  const mount = await mkdtemp(join(tmpdir(), "omni-delivery-image-"));
  let mounted = false;
  try {
    run("hdiutil", [
      "attach",
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mount,
      join(stage, `macOS/OMNI-${version}-macOS-arm64.dmg`),
    ]);
    mounted = true;
    run("codesign", [
      "--verify",
      "--deep",
      "--strict",
      join(mount, "OMNI.app"),
    ]);
    for (const file of [
      "Contents/Info.plist",
      "Contents/_CodeSignature/CodeResources",
      "Contents/MacOS/omni-desktop",
    ])
      assert.equal(
        await digest(join(mount, "OMNI.app", file)),
        await digest(join(stage, "macOS/OMNI.app", file)),
        "Disk image and extracted application must match",
      );
  } finally {
    if (mounted) run("hdiutil", ["detach", mount]);
    await rm(mount, { recursive: true, force: true });
  }
  const manifest = {
    product: "OMNI",
    version,
    channel: "MVP evaluation",
    assembled_at: new Date().toISOString(),
    source_repository: "https://github.com/nabz0r/OMNI-OS",
    platforms: {
      macos: {
        source_revision: values["--macos-revision"],
        build_run: values["--macos-run"],
        profile: macBuild.profile,
        architecture: "Apple Silicon ARM64",
        minimum_os: "macOS 14.4",
        signature: macBuild.signing,
        startup: macBuild.smoke,
        integrity: macBuild.integrity,
      },
      android: {
        source_revision: values["--android-revision"],
        architectures: ["arm64-v8a", "x86_64"],
        minimum_api: 24,
        tested_os: "Android 15 AOSP ARM64 emulator",
        signature: androidBuild.signing,
        acceptance: `${Object.keys(acceptance.assertions).length} native acceptance checks passed`,
        keystore: "5 instrumentation tests passed",
        tested_apk_sha256: acceptance.apk_sha256,
        upgrade: `${Object.keys(upgrade.assertions).length} in-place upgrade checks passed from the ${previous.version} evaluation APK`,
        certificate_sha256: upgrade.certificate_sha256,
      },
    },
    boundaries: [
      "No Apple Developer ID signing or notarization",
      "Android development signing; no Play Store release",
      "No physical-phone test claim",
      "No inference model or provider credits bundled",
      "Separate device vaults; no synchronization or complete recovery wizard",
    ],
    packages: [],
    source_archive: {
      file: sourceArchive,
      revision: values["--macos-revision"],
      sha256: await digest(join(stage, sourceArchive)),
    },
  };
  for (const [, file] of files.filter(([, file]) =>
    /\.(apk|dmg|zip)$/.test(file),
  ))
    manifest.packages.push({
      file,
      bytes: (await stat(join(stage, file))).size,
      sha256: await digest(join(stage, file)),
    });
  await writeFile(
    join(stage, "delivery.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const sums = [];
  async function inventory(relative = "") {
    for (const entry of (
      await readdir(join(stage, relative), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(relative, entry.name);
      if (entry.isDirectory()) await inventory(file);
      else if (entry.isFile())
        sums.push(`${await digest(join(stage, file))}  ${file}`);
      else
        throw new Error(
          `Unexpected non-regular delivery entry: ${basename(file)}`,
        );
    }
  }
  await inventory();
  await writeFile(join(stage, "SHA256SUMS"), `${sums.join("\n")}\n`);
  await rename(stage, destination);
  console.log(`Verified delivery assembled: ${destination}`);
  console.log(
    `${sums.length} file hashes recorded; macOS resource seal, disk image and APK signature verified.`,
  );
} catch (error) {
  await rm(stage, { recursive: true, force: true });
  throw error;
}
