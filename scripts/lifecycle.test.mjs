import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { waitForServices } from "./wait-ready.mjs";

const execute = promisify(execFile);

test("cleanup before launching services is safe and idempotent on macOS Bash", async () => {
  await execute("bash", [
    "-c",
    'set -euo pipefail; source "$1"; omni_stop_services; omni_stop_services',
    "omni-test",
    resolve("scripts/lifecycle.sh"),
  ]);
});

test("readiness checks services together and releases response bodies", async () => {
  const calls = new Map();
  let cancelled = 0;
  await waitForServices(["core", "collector", "ui"], {
    timeoutMs: 1000,
    intervalMs: 1,
    fetchService: async (url) => {
      calls.set(url, (calls.get(url) ?? 0) + 1);
      return {
        ok: url !== "core" || calls.get(url) > 1,
        body: {
          cancel: async () => {
            cancelled++;
          },
        },
      };
    },
  });
  assert.equal(calls.get("core"), 2);
  assert.equal(calls.get("collector"), 1);
  assert.equal(calls.get("ui"), 1);
  assert.equal(cancelled, 4);
});

test("startup fails immediately when an owned service exits", async () => {
  let fetched = false;
  await assert.rejects(
    waitForServices(["core"], {
      isAlive: () => false,
      fetchService: async () => {
        fetched = true;
      },
    }),
    /service stopped/,
  );
  assert.equal(fetched, false);
});

test("readiness timeout reports only services still unavailable", async () => {
  await assert.rejects(
    waitForServices(["ready", "missing"], {
      timeoutMs: 20,
      intervalMs: 1,
      fetchService: async (url) => ({ ok: url === "ready" }),
    }),
    /Service not ready: missing\./,
  );
});

for (const parentExits of [false, true])
  test(
    `shutdown removes TERM-resistant descendants when the leader ${parentExits ? "already exited" : "is still alive"}`,
    { timeout: 15000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "omni-lifecycle-"));
      try {
        const fixture = join(directory, "fixture.mjs");
        const descendant = join(directory, "descendant.mjs");
        const pidfile = join(directory, "pids.json");
        await writeFile(
          descendant,
          `process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);`,
        );
        await writeFile(
          fixture,
          `import { fork } from 'node:child_process'; import { writeFileSync } from 'node:fs'; const child = fork(process.argv[2]); child.once('message', () => { writeFileSync(process.argv[3], JSON.stringify([process.pid, child.pid])); ${parentExits ? "process.exit(0);" : ""} }); setInterval(() => {}, 1000);`,
        );
        await execute(
          "bash",
          [
            "-c",
            `
      set -euo pipefail
      source "$1"
      trap omni_stop_services EXIT
      omni_start_service fixture "$2" "$3" "$4" "$5" "$6"
      for _ in {1..100}; do [[ -f "$6" ]] && break; sleep 0.02; done
      [[ -f "$6" ]]
      ${parentExits ? 'for _ in {1..100}; do if ! kill -0 "${omni_pids[0]}" 2>/dev/null; then break; fi; sleep 0.02; done; if omni_check_services; then exit 1; fi' : "omni_check_services"}
      omni_stop_services
    `,
            "omni-test",
            resolve("scripts/lifecycle.sh"),
            join(directory, "fixture.log"),
            process.execPath,
            fixture,
            descendant,
            pidfile,
          ],
          { timeout: 10000 },
        );
        const pids = JSON.parse(await readFile(pidfile, "utf8"));
        for (const pid of pids) {
          let gone = false;
          for (let i = 0; i < 50; i++) {
            try {
              process.kill(pid, 0);
            } catch (error) {
              if (error.code === "ESRCH") {
                gone = true;
                break;
              }
              throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert.equal(gone, true, `Owned process ${pid} survived shutdown`);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
