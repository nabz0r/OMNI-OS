import { readFile, stat, readdir } from "node:fs/promises";
import { join, resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import {
  root,
  output,
  catalog,
  inspect,
  digest,
  localLink,
} from "./common.mjs";
const errors = [],
  documents = new Map(),
  seen = new Set();
let markdownLinks = 0,
  htmlLinks = 0,
  diagramCount = 0;
const manifest = JSON.parse(
  await readFile(join(root, "docs/assets/diagrams/manifest.json"), "utf8"),
);
for (const entry of catalog) {
  if (seen.has(entry.path))
    errors.push(`Duplicate catalogue entry: ${entry.path}`);
  seen.add(entry.path);
  const text = await readFile(join(root, entry.path), "utf8");
  documents.set(entry.path, inspect(text));
}
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n");
for (const file of tracked)
  if (file !== "AGENTS.md" && !seen.has(file))
    errors.push(`Uncatalogued Markdown guide: ${file}`);
for (const [file, doc] of documents) {
  for (const url of doc.links) {
    let link;
    try {
      link = localLink(file, url);
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    if (!link) continue;
    markdownLinks++;
    try {
      await stat(link.path);
    } catch {
      errors.push(`Missing target: ${file} -> ${url}`);
      continue;
    }
    if (link.fragment && link.path.endsWith(".md")) {
      const target =
        documents.get(link.relative) ||
        inspect(await readFile(link.path, "utf8"));
      if (!target.ids.includes(link.fragment))
        errors.push(`Missing anchor: ${file} -> ${url}`);
    }
  }
  for (const source of doc.diagrams) {
    diagramCount++;
    const hash = digest(source),
      record = manifest[hash];
    if (!record) {
      errors.push(`Stale or missing diagram: ${file}`);
      continue;
    }
    const svg = await readFile(
      join(root, "docs/assets/diagrams", record.file),
      "utf8",
    );
    if (!svg.includes("<svg") || !/viewBox=/.test(svg))
      errors.push(`Invalid SVG: ${record.file}`);
  }
}
const htmlFiles = [
  "index.html",
  ...(await readdir(join(output, "pages")))
    .filter((x) => x.endsWith(".html"))
    .map((x) => "pages/" + x),
];
const htmlCache = new Map();
for (const file of htmlFiles)
  htmlCache.set(file, await readFile(join(output, file), "utf8"));
for (const [file, html] of htmlCache) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  if (ids.length !== new Set(ids).size)
    errors.push(`Duplicate HTML id: ${file}`);
  if (
    /\{\{(?:VERSION|ANDROID_CHECKS|PREVIOUS_VERSION)\}\}/.test(html) &&
    !file.includes("scripts-delivery-readme")
  )
    errors.push(`Unresolved template: ${file}`);
  for (const [, raw] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = raw.replaceAll("&amp;", "&");
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) continue;
    htmlLinks++;
    const [path, frag = ""] = url.split("#", 2);
    let target;
    try {
      target = path
        ? resolve(output, dirname(file), decodeURIComponent(path))
        : join(output, file);
    } catch {
      errors.push(`Bad URL: ${file} -> ${url}`);
      continue;
    }
    if (!target.startsWith(output + "/")) {
      errors.push(`Link leaves output: ${file} -> ${url}`);
      continue;
    }
    try {
      await stat(target);
    } catch {
      errors.push(`Missing output target: ${file} -> ${url}`);
      continue;
    }
    if (frag && target.endsWith(".html")) {
      const other =
        htmlCache.get(relative(output, target)) ||
        (await readFile(target, "utf8"));
      if (!other.includes(`id="${decodeURIComponent(frag)}"`))
        errors.push(`Missing HTML anchor: ${file} -> ${url}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      documents: catalog.length,
      pages: htmlFiles.length,
      markdown_links: markdownLinks,
      html_links: htmlLinks,
      mermaid_blocks: diagramCount,
      distinct_diagrams: Object.keys(manifest).length,
      scope:
        "Local paths, anchors, source hashes, generated resources and catalogue coverage. External websites are not revalidated.",
    },
    null,
    2,
  ),
);
