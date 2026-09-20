import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
const root = resolve(import.meta.dirname, "..");
let directory = process.env.CARGO_TARGET_DIR;
if (!directory) {
  try {
    directory = readFileSync(
      resolve(root, ".omni/runtime/build-target"),
      "utf8",
    ).trim();
  } catch {}
}
// Some vendored C/Perl build systems cannot safely quote project directories.
directory ||= /[\s']/.test(root)
  ? resolve(tmpdir(), `omni-os-target-${process.getuid?.() ?? "local"}`)
  : resolve(root, "target");
process.stdout.write(resolve(directory));
