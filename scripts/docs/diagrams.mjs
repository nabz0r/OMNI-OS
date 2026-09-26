import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { catalog, root, inspect, digest, stripManaged } from "./common.mjs";
const tool = process.env.MMDC_BIN;
if (!tool)
  throw new Error(
    "Set MMDC_BIN to an installed Mermaid CLI. See docs/DOCUMENTATION.md.",
  );
const target = join(root, "docs/assets/diagrams"),
  scratch = join(root, "artifacts/docs-diagrams");
await mkdir(target, { recursive: true });
await mkdir(scratch, { recursive: true });
const config = join(scratch, "theme.json");
await writeFile(
  config,
  JSON.stringify({
    theme: "base",
    securityLevel: "strict",
    themeVariables: {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      primaryColor: "#edf4ee",
      primaryTextColor: "#183328",
      primaryBorderColor: "#547b63",
      lineColor: "#547b63",
      secondaryColor: "#fbf5e5",
      tertiaryColor: "#f6f7f2",
      background: "#ffffff",
    },
    flowchart: { htmlLabels: false, useMaxWidth: true },
    sequence: { useMaxWidth: true },
  }),
);
const manifest = {};
for (const entry of catalog) {
  const source = stripManaged(await readFile(join(root, entry.path), "utf8"));
  for (const diagram of inspect(source).diagrams) {
    const hash = digest(diagram);
    if (manifest[hash]) {
      manifest[hash].sources.push(entry.path);
      continue;
    }
    const file = hash.slice(0, 20) + ".svg",
      input = join(scratch, hash + ".mmd");
    await writeFile(input, diagram);
    const args = [
      "-i",
      input,
      "-o",
      join(target, file),
      "-c",
      config,
      "-b",
      "white",
      "-w",
      "1500",
    ];
    if (process.env.MERMAID_PUPPETEER_CONFIG)
      args.push("-p", resolve(process.env.MERMAID_PUPPETEER_CONFIG));
    const result = spawnSync(tool, args, { encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(
        `Diagram render failed in ${entry.path}: ${result.stderr}`,
      );
    manifest[hash] = { file, sources: [entry.path] };
    console.log(`Rendered ${entry.path}: ${file}`);
  }
}
await writeFile(
  join(target, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`${Object.keys(manifest).length} distinct diagrams rendered.`);
