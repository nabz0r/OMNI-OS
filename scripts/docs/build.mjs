import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  root,
  output,
  catalog,
  escape as e,
  pageName,
  render,
} from "./common.mjs";
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim().length > 0;
const manifest = JSON.parse(
  await readFile(join(root, "docs/assets/diagrams/manifest.json"), "utf8"),
);
await rm(output, { recursive: true, force: true });
await mkdir(join(output, "pages"), { recursive: true });
await cp(join(root, "docs/site"), join(output, "assets"), { recursive: true });
await cp(join(root, "docs/assets"), join(output, "files/docs/assets"), {
  recursive: true,
});
const groups = [...new Set(catalog.map((x) => x.group))];
function nav(current, home) {
  const pre = home ? "pages/" : "";
  return groups
    .map(
      (group) =>
        `<details class="nav-group" ${group === (current?.group || "Start") ? "open" : ""}><summary>${e(group)}<span>${catalog.filter((x) => x.group === group).length}</span></summary><div>${catalog
          .filter((x) => x.group === group)
          .map(
            (x) =>
              `<a ${x.path === current?.path ? 'aria-current="page"' : ""} href="${pre + pageName(x)}">${e(x.title)}</a>`,
          )
          .join("")}</div></details>`,
    )
    .join("");
}
function shell(entry, body, toc = [], minutes = 0) {
  const home = !entry,
    pre = home ? "" : "../";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="${e(entry?.summary || "The OMNI field guide: local memory, explicit permissions and request policies.")}"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>${e(entry?.title || "The OMNI field guide")} · OMNI</title><link rel="stylesheet" href="${pre}assets/style.css"><script defer src="${pre}assets/search-data.js"></script><script defer src="${pre}assets/site.js"></script></head>
<body data-root="${pre}" class="${home ? "home" : "document"}"><a class="skip-link" href="#main">Skip to content</a>
<header class="topbar"><a class="wordmark" href="${pre}index.html" aria-label="OMNI field guide home">OMNI<span>.</span></a><span class="edition">THE FIELD GUIDE <i>/</i> ${e(version)}</span><div class="top-actions"><button class="search-open" aria-haspopup="dialog" aria-controls="search-dialog">Search the guide <kbd>/</kbd></button><button class="theme-toggle" aria-label="Use dark theme">◐</button><button class="menu-toggle" aria-controls="sidebar" aria-expanded="false">Menu</button></div></header>
<div class="layout"><aside class="sidebar" id="sidebar" aria-label="Documentation sections"><div class="sidebar-intro">A map of the product.<br>A record of the boundaries.</div><nav aria-label="Documentation">${nav(entry, home)}</nav><a class="sidebar-repo" href="https://github.com/nabz0r/OMNI-OS">Source repository ↗</a></aside>
<main id="main" tabindex="-1">${
    entry
      ? `<div class="document-grid"><article><header class="article-header"><div class="eyebrow">${e(entry.group)}</div><div class="doc-meta"><span class="status">${e(entry.status)}</span><span>${minutes} min read</span></div><h1>${e(entry.title)}</h1><p class="lede">${e(entry.summary)}</p></header><div class="prose">${body}</div><footer class="article-footer"><a href="${pre}files/${entry.path}">Read the Markdown source ↗</a><a href="${pre}index.html">Back to the field guide</a></footer></article><aside class="toc" aria-label="On this page"><p>ON THIS PAGE</p>${toc
          .filter((x) => [2, 3].includes(x.depth))
          .map(
            (x) =>
              `<a class="depth-${x.depth}" href="#${encodeURIComponent(x.id)}">${e(x.title)}</a>`,
          )
          .join("")}</aside></div>`
      : body
  }
<footer class="site-footer"><span>OMNI / Your context. Your authority.</span><span>English documentation · Local search · No analytics</span></footer></main></div>
<dialog id="search-dialog" aria-labelledby="search-title"><div class="search-top"><label id="search-title" for="search-input">Find your next step</label><button id="search-close" aria-label="Close search">Esc</button></div><input id="search-input" type="search" placeholder="Try: import, permissions, Android…" autocomplete="off"><p id="search-status" role="status" aria-live="polite">Search titles, topics and document text. Everything runs locally.</p><div id="search-results"></div></dialog></body></html>`;
}
const cards = [
  [
    "01",
    "Use your context",
    "Install the app, bring a conversation and decide which memories can be shared.",
    "docs/GETTING_STARTED.md",
    "Start with one conversation",
  ],
  [
    "02",
    "Control work context",
    "Approve each client, inspect what leaves and retain conversations only with consent.",
    "docs/WORK.md",
    "Explore Work",
  ],
  [
    "03",
    "Operate with care",
    "Understand key custody, deployment modes, recovery limits and release evidence.",
    "docs/PLATFORMS.md",
    "Read the platform guide",
  ],
  [
    "04",
    "Evaluate the venture",
    "Separate the functioning MVP from hypotheses about buyers, economics and funding.",
    "docs/assessment/README.md",
    "Open the assessment",
  ],
];
const href = (path) =>
  "pages/" + pageName(catalog.find((x) => x.path === path));
const home = `<section class="hero"><div class="hero-copy"><div class="eyebrow">LOCAL MEMORY. EXPLICIT CONTROL.</div><h1>Your context.<br><em>Your authority.</em></h1><p>A field guide to keeping what matters,<br class="wide-only"> choosing what leaves, and seeing what happened.</p><div class="hero-actions"><a class="button primary" href="${href("docs/GETTING_STARTED.md")}">Start here <span>↗</span></a><a class="button quiet" href="${href("docs/DELIVERY.md")}">Explore the ${e(version)} delivery</a></div><div class="hero-note"><span class="signal-dot"></span> An evaluation MVP. Boundaries included.</div></div><div class="hero-art" aria-label="Conceptual path: reviewed context passes through permissions and policy before a chosen model"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="context-chip chip-top"><span>01 / YOUR CONTEXT</span>Reviewed. Correctable. Local.</div><div class="authority-core"><span class="core-dot"></span><strong>OMNI<span>.</span></strong><small>Memory · Permissions · Policies</small></div><div class="context-chip chip-bottom"><span>02 / YOUR DECISION</span>Choose the destination.</div><div class="art-caption">A conceptual view of supported request paths.</div></div></section>
<div class="evidence-strip"><div><strong>${e(version)}</strong><span>LOCAL EVALUATION</span></div><div><strong>80</strong><span>CORE CONTRACT TESTS</span></div><div><strong>16</strong><span>CONTROLLED-LOOP CHECKS</span></div><a href="${href("docs/VALIDATION.md")}">Read the measured scope ↗</a></div>
<section class="home-section"><div class="section-heading"><div><div class="eyebrow">CHOOSE YOUR PATH</div><h2>Less searching.<br>More understanding.</h2></div><p>Four starting points.<br>One source of truth.</p></div><div class="path-grid">${cards.map(([n, t, d, p, c]) => `<a class="path-card" href="${href(p)}"><span class="card-number">${n}</span><h3>${t}</h3><p>${d}</p><span class="card-link">${c} ↗</span></a>`).join("")}</div></section>
<section class="workspace-section"><div><div class="eyebrow">THE ACTUAL WORKSPACE</div><h2>Context you can inspect.</h2><p>Memories, connections, permissions and request decisions belong in the same conversation.</p><a class="text-link" href="${href("docs/ADMINISTRATION.md")}">Walk through the workspace ↗</a><p class="caption">Actual application interface with synthetic demonstration data.</p></div><img src="files/docs/images/nebula.png" alt="Actual OMNI workspace showing synthetic demonstration memories" loading="lazy"></section>
<section class="home-section"><div class="section-heading"><div><div class="eyebrow">READ THE BOUNDARIES</div><h2>Clear claims.<br>Useful evidence.</h2></div></div><div class="boundary-grid"><div><h3>Local does not mean invisible.</h3><p>A remote provider receives the request and context you send. The vault and local controls do not erase that disclosure.</p><a href="${href("docs/PRIVACY.md")}">Follow the data ↗</a></div><div><h3>A target is not a feature.</h3><p>Plans, historical notes and completed checks carry different labels. Evidence belongs to its named build and environment.</p><a href="${href("ROADMAP.md")}">Read the roadmap ↗</a></div><div><h3>A tunnel is not a chat reader.</h3><p>OMNI checks supported application paths. A VPN does not make another application's encrypted prompts readable.</p><a href="${href("docs/PRO_MVP.md")}">Understand the professional MVP ↗</a></div></div></section>
<section class="reading-note"><span>KEEP EXPLORING</span><h2>The details are the product.</h2><p>${catalog.length} guides, references and dated records. Search locally, follow a diagram, or start with the questions people ask first.</p><a class="button primary" href="${href("docs/FAQ.md")}">Open the FAQ ↗</a></section>`;
const search = [];
for (const entry of catalog) {
  const rendered = await render(entry, manifest, revision);
  // Preserve explicit links to the source's first heading even though the masthead replaces it.
  const firstHeading = rendered.headings.find((x) => x.depth === 1);
  const anchor = firstHeading
    ? `<span id="${e(firstHeading.id)}" class="source-anchor"></span>`
    : "";
  await writeFile(
    join(output, "pages", pageName(entry)),
    shell(entry, anchor + rendered.html, rendered.headings, rendered.minutes),
  );
  const raw = join(output, "files", entry.path);
  await mkdir(join(raw, ".."), { recursive: true });
  await cp(join(root, entry.path), raw);
  search.push({
    ...entry,
    url: "pages/" + pageName(entry),
    text: rendered.text.slice(0, 160000),
  });
}
await writeFile(
  join(output, "assets/search-data.js"),
  "window.OMNI_SEARCH = " +
    JSON.stringify(search).replaceAll("<", "\\u003c") +
    ";\n",
);
await writeFile(join(output, "index.html"), shell(null, home));
await writeFile(
  join(output, "build-info.json"),
  JSON.stringify(
    {
      source_revision: revision,
      source_dirty: dirty,
      pages: catalog.length + 1,
      documents: catalog.length,
      diagrams: Object.keys(manifest).length,
      network_dependencies: 0,
      generated_at: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Built ${catalog.length + 1} offline pages and ${Object.keys(manifest).length} diagrams in artifacts/docs-site/.`,
);
