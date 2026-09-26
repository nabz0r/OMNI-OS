import { readFile, writeFile } from "node:fs/promises";
import { relative, dirname, join } from "node:path";
import { catalog, root, stripManaged } from "./common.mjs";
let changed = 0;
for (const entry of catalog) {
  if (["README.md", "scripts/delivery/README.md"].includes(entry.path))
    continue;
  const file = join(root, entry.path),
    original = await readFile(file, "utf8");
  let text = stripManaged(original);
  const link = (p) =>
    relative(dirname(file), join(root, p)).replaceAll("\\", "/");
  const header = `<!-- omni:header -->\n[OMNI](${link("README.md")}) / [Field guide](${link("docs/README.md")}) / ${entry.group}\n\n> **${entry.status}** · ${entry.summary}\n<!-- /omni:header -->\n\n`;
  const peers = catalog
    .filter((e) => e.group === entry.group && e.path !== entry.path)
    .slice(0, 3);
  const footer = `\n\n<!-- omni:footer -->\n---\n\n**Continue reading** · ${peers.map((e) => `[${e.title}](${link(e.path)})`).join(" · ")}\n\n[All documentation](${link("docs/README.md")}) · [Delivery and verification](${link("docs/DELIVERY.md")})\n<!-- /omni:footer -->\n`;
  text = header + text.trim() + footer;
  if (text !== original) {
    await writeFile(file, text);
    changed++;
  }
}
console.log(`Documentation navigation synchronized: ${changed} files updated.`);
