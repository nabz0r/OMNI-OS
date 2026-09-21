import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const stampPath = (directory) =>
  resolve(directory, ".omni/runtime/dependencies.sha256");

export async function dependencyFingerprint(directory = root) {
  const manifest = await readFile(resolve(directory, "package.json"), "utf8");
  const workspaces = JSON.parse(manifest).workspaces ?? [];
  const hash = createHash("sha256");
  hash.update(
    `omni-npm-v1\n${process.platform}\n${process.arch}\n${process.versions.modules}\n`,
  );
  for (const [name, contents] of [
    ["package.json", manifest],
    [
      "package-lock.json",
      await readFile(resolve(directory, "package-lock.json")),
    ],
    ...(await Promise.all(
      workspaces.map(async (workspace) => [
        `${workspace}/package.json`,
        await readFile(resolve(directory, workspace, "package.json")),
      ]),
    )),
  ]) {
    hash.update(name);
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function dependenciesCurrent(directory = root) {
  try {
    if (!(await stat(resolve(directory, "node_modules"))).isDirectory())
      return false;
    // npm's own installation marker must also exist after a successful npm ci.
    await stat(resolve(directory, "node_modules/.package-lock.json"));
    return (
      (await readFile(stampPath(directory), "utf8")).trim() ===
      (await dependencyFingerprint(directory))
    );
  } catch {
    return false;
  }
}

export async function recordDependencies(directory = root) {
  if (!(await stat(resolve(directory, "node_modules"))).isDirectory())
    throw new Error("The dependency installation is incomplete.");
  await stat(resolve(directory, "node_modules/.package-lock.json"));
  await mkdir(resolve(directory, ".omni/runtime"), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    stampPath(directory),
    `${await dependencyFingerprint(directory)}\n`,
    {
      mode: 0o600,
    },
  );
}

export async function invalidateDependencies(directory = root) {
  await rm(stampPath(directory), { force: true });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    switch (process.argv[2]) {
      case "check":
        process.exitCode = (await dependenciesCurrent()) ? 0 : 1;
        break;
      case "record":
        await recordDependencies();
        break;
      case "invalidate":
        await invalidateDependencies();
        break;
      default:
        throw new Error(
          "Usage: node scripts/dependency-stamp.mjs check|record|invalidate",
        );
    }
  } catch {
    process.stderr.write(
      "Dependency state could not be recorded. Re-run ./scripts/bootstrap.sh after checking the npm installation.\n",
    );
    process.exitCode = 1;
  }
}
