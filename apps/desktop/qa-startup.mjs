import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import net from "node:net";

// Exercise the production bundle, including failed imports before React starts.
// Native IPC is mocked here; this suite makes no macOS WebKit or Keychain claim.
const directory = resolve(import.meta.dirname, "artifacts/startup");
await mkdir(directory, { recursive: true });
const reserve = net.createServer();
await new Promise((done) => reserve.listen(0, "127.0.0.1", done));
const port = reserve.address().port;
await new Promise((done) => reserve.close(done));
const server = spawn(
  process.execPath,
  [
    resolve(import.meta.dirname, "../../node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: import.meta.dirname, stdio: "ignore" },
);
const url = `http://127.0.0.1:${port}`;
let browser;
const assertions = {};
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i === 99) throw new Error("Production preview did not start.");
    await new Promise((done) => setTimeout(done, 50));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.OMNI_QA_CHROMIUM
      ? { executablePath: process.env.OMNI_QA_CHROMIUM }
      : {}),
  });
  let page = await browser.newPage();
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) => route.abort());
  await page.goto(url);
  await page.getByRole("heading", { name: "Opening your space…" }).waitFor();
  assert.equal(await page.locator("#root").innerHTML(), "");
  assert.equal(
    await page
      .locator("#omni-startup")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(11, 14, 17)",
  );
  assertions.missing_entry_keeps_static_recovery_visible = true;
  await page.close();

  page = await browser.newPage();
  let failImport = true;
  await page.route(/\/assets\/main-[^/]+\.js$/, (route) =>
    failImport ? route.abort() : route.continue(),
  );
  await page.goto(url);
  await page
    .getByRole("heading", { name: "OMNI could not finish opening." })
    .waitFor();
  await page.screenshot({ path: resolve(directory, "chunk-recovery.png") });
  assertions.failed_application_chunk_has_reload_action = true;
  failImport = false;
  await page.getByRole("button", { name: "Reload OMNI", exact: true }).click();
  await page.locator("#omni-startup").waitFor({ state: "hidden" });
  assert.ok((await page.locator("#root > *").count()) > 0);
  assertions.reload_recovers_after_transient_chunk_failure = true;
  await page.close();

  for (const mode of ["rejected", "stalled"]) {
    page = await browser.newPage();
    const phases = [];
    await page.exposeFunction("__omniStartupTest", async (command, args) => {
      if (command === "startup_report") {
        phases.push(args.phase);
        return null;
      }
      assert.equal(command, "native_session");
      if (mode === "stalled") return new Promise(() => {});
      throw new Error(
        "The system key store is unavailable. Unlock your device and try again.",
      );
    });
    await page.addInitScript(() => {
      window.__TAURI_INTERNALS__ = {
        invoke: (command, args) => window.__omniStartupTest(command, args),
      };
    });
    await page.goto(url);
    await page
      .getByRole("heading", { name: "Your vault needs attention." })
      .waitFor({ timeout: 28000 });
    await page.locator("#omni-startup").waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .count(),
      1,
    );
    assert.ok(phases.includes("recovery"));
    assert.ok(!phases.includes("ready"));
    assertions[`${mode}_vault_shows_recovery_without_false_readiness`] = true;
    await page.screenshot({ path: resolve(directory, `${mode}-vault.png`) });
    await page.close();
  }
  await writeFile(
    resolve(directory, "acceptance.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "Production web bundle; mocked native IPC; no native renderer or OS key-store claim",
        assertions,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Startup fault tests: ${Object.keys(assertions).length} passed.`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
