import { readFile, mkdir, cp, stat } from "node:fs/promises";
import { resolve, dirname, relative, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import { toHtml } from "hast-util-to-html";
import GithubSlugger from "github-slugger";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const output = join(root, "artifacts/docs-site");
export const catalog = JSON.parse(
  await readFile(join(root, "docs/catalog.json"), "utf8"),
);
export const parse = (text) =>
  unified().use(remarkParse).use(remarkGfm).parse(text);
export const plain = (node) =>
  node.value ?? (node.children || []).map(plain).join("");
export function walk(node, fn) {
  fn(node);
  for (const child of node.children || []) walk(child, fn);
}
export const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export const pageName = (entry) =>
  entry.path
    .replace(/\.md$/, "")
    .replaceAll("/", "-")
    .replaceAll("_", "-")
    .toLowerCase() + ".html";
export const digest = (text) =>
  createHash("sha256").update(text.trim()).digest("hex");
export const stripManaged = (text) =>
  text
    .replace(/<!-- omni:header -->[\s\S]*?<!-- \/omni:header -->\s*/g, "")
    .replace(/<!-- omni:footer -->[\s\S]*?<!-- \/omni:footer -->\s*/g, "");
export function inspect(text) {
  const tree = parse(text),
    slugger = new GithubSlugger(),
    headings = [],
    ids = [],
    links = [],
    diagrams = [];
  walk(tree, (node) => {
    if (node.type === "heading") {
      const title = plain(node),
        id = slugger.slug(title);
      node.data = { ...node.data, hProperties: { id } };
      ids.push(id);
      headings.push({ depth: node.depth, title, id });
    }
    if (["link", "image", "definition"].includes(node.type))
      links.push(node.url);
    if (node.type === "html") {
      for (const m of node.value.matchAll(/\b(?:href|src)=["']([^"']+)["']/g))
        links.push(m[1]);
      for (const m of node.value.matchAll(/\bid=["']([^"']+)["']/g))
        ids.push(m[1]);
    }
    if (node.type === "code" && node.lang === "mermaid")
      diagrams.push(node.value);
  });
  return { tree, headings, ids, links, diagrams };
}
export function localLink(from, url) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return null;
  const [file, fragment = ""] = url.split("#", 2);
  const filename = decodeURIComponent(file.split("?")[0]);
  const path = filename
    ? resolve(root, dirname(from), filename)
    : resolve(root, from);
  if (path !== root && !path.startsWith(root + "/"))
    throw new Error(`Link leaves repository: ${from}: ${url}`);
  return {
    path,
    relative: relative(root, path).replaceAll("\\", "/"),
    fragment: decodeURIComponent(fragment),
  };
}
export async function render(entry, manifest, revision) {
  const text = stripManaged(await readFile(join(root, entry.path), "utf8"));
  const inspected = inspect(text),
    { tree } = inspected;
  // The page masthead supplies its own title; source headings keep their anchors.
  const first = tree.children.findIndex(
    (n) => n.type === "heading" && n.depth === 1,
  );
  if (first !== -1) tree.children.splice(first, 1);
  let caption = entry.title;
  walk(tree, (node) => {
    if (node.type === "heading") caption = plain(node);
    if (node.type === "code" && node.lang === "mermaid") {
      const hash = digest(node.value),
        record = manifest[hash];
      if (!record)
        throw new Error(`Render missing diagram in ${entry.path}: ${hash}`);
      const src = `../files/docs/assets/diagrams/${record.file}`;
      node.type = "html";
      node.value = `<figure class="diagram"><a href="${src}" aria-label="Open diagram: ${escape(caption)}"><img src="${src}" alt="${escape(caption)}" loading="lazy"></a><figcaption>${escape(caption)} · <a href="${src}">Open full-size diagram ↗</a></figcaption></figure>`;
      delete node.lang;
    }
  });
  const copied = new Set();
  async function destination(url) {
    const link = localLink(entry.path, url);
    if (!link) return url;
    const fragment = link.fragment
      ? "#" + encodeURIComponent(link.fragment)
      : "";
    if (!url.split("#")[0]) return fragment || "#";
    const target = catalog.find((e) => e.path === link.relative);
    if (target) return pageName(target) + fragment;
    const info = await stat(link.path);
    if (info.isDirectory())
      return (
        `https://github.com/nabz0r/OMNI-OS/tree/${revision}/${link.relative}` +
        fragment
      );
    if (
      [
        ".png",
        ".svg",
        ".jpg",
        ".jpeg",
        ".webp",
        ".json",
        ".md",
        ".html",
      ].includes(extname(link.path))
    ) {
      const targetFile = join(output, "files", link.relative);
      if (!copied.has(link.relative)) {
        await mkdir(dirname(targetFile), { recursive: true });
        await cp(link.path, targetFile);
        copied.add(link.relative);
      }
      return (
        "../files/" +
        link.relative.split("/").map(encodeURIComponent).join("/") +
        fragment
      );
    }
    return (
      `https://github.com/nabz0r/OMNI-OS/blob/${revision}/${link.relative}` +
      fragment
    );
  }
  const pending = [];
  walk(tree, (node) => {
    if (["link", "image", "definition"].includes(node.type))
      pending.push(
        destination(node.url).then((url) => {
          node.url = url;
        }),
      );
    if (node.type === "html")
      pending.push(
        (async () => {
          const matches = [
            ...node.value.matchAll(/\b(href|src)=(["'])([^"']+)\2/g),
          ];
          // Generated diagram references already point into the output bundle.
          if (node.value.startsWith('<figure class="diagram">')) return;
          for (const match of matches)
            node.value = node.value.replace(
              match[0],
              `${match[1]}=${match[2]}${await destination(match[3])}${match[2]}`,
            );
        })(),
      );
  });
  await Promise.all(pending);
  const hast = await unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .run(tree);
  return {
    html: toHtml(hast, { allowDangerousHtml: true }),
    headings: inspected.headings,
    text: plain(tree),
    minutes: Math.max(1, Math.ceil(text.split(/\s+/).length / 220)),
  };
}
