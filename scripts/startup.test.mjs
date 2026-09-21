import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn, execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  connectionURL,
  browserEnvironment,
  openBrowser,
} from "./open-browser.mjs";
import {
  dependenciesCurrent,
  recordDependencies,
  invalidateDependencies,
} from "./dependency-stamp.mjs";
import {
  inspectInstallation,
  formatDiagnosis,
  localModelURL,
} from "./doctor.mjs";

const secret = "a".repeat(64);
const execute = promisify(execFile);
for (const [platform, command] of [
  ["darwin", "open"],
  ["linux", "xdg-open"],
  ["win32", "rundll32.exe"],
]) {
  test(`browser handoff uses an argument array without a shell on ${platform}`, async () => {
    let invocation;
    await openBrowser("http://localhost:3006", secret, {
      platform,
      environment: {
        PATH: "/safe",
        OMNI_LOCAL_TOKEN: "owner",
        OMNI_PAIRING_SECRET: secret,
        OPENAI_API_KEY: "key",
      },
      launch: (...args) => {
        invocation = args;
        const child = new EventEmitter();
        child.unref = () => {};
        queueMicrotask(() => child.emit("exit", 0));
        return child;
      },
    });
    assert.equal(invocation[0], command);
    assert.equal(
      invocation[1].at(-1),
      `http://localhost:3006/#connect=${secret}`,
    );
    assert.equal(invocation[2].shell, false);
    assert.equal(invocation[2].detached, true);
    assert.deepEqual(invocation[2].env, { PATH: "/safe" });
    assert.equal(new URL(invocation[1].at(-1)).search, "");
  });
}
test("browser handoff rejects remote URLs and never returns sensitive child errors", async () => {
  for (const url of [
    "https://example.org",
    "http://user:password@localhost:3006",
    "http://localhost:3006/?token=unsafe",
    "http://localhost:3006/#unsafe",
    "file:///tmp/index.html",
  ])
    assert.throws(() => connectionURL(url, secret), /local HTTP/);
  assert.throws(
    () => connectionURL("http://localhost:3006", "$(unsafe)"),
    /invalid/,
  );
  await assert.rejects(
    openBrowser("http://localhost:3006", secret, {
      launch: () => {
        throw new Error(`spawn failed with ${secret}`);
      },
    }),
    (error) =>
      !error.message.includes(secret) &&
      /could not be opened/.test(error.message),
  );
  assert.deepEqual(
    browserEnvironment({
      LANG: "en_US.UTF-8",
      PASSWORD: "no",
      ANTHROPIC_API_KEY: "no",
      OMNI_AGENT_TOKEN: "no",
    }),
    { LANG: "en_US.UTF-8" },
  );
});

test("dependency stamp detects lockfile, workspace and interrupted-install changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "omni-dependencies-"));
  try {
    await mkdir(join(directory, "workspace"));
    await mkdir(join(directory, "node_modules"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ workspaces: ["workspace"] }),
    );
    await writeFile(
      join(directory, "package-lock.json"),
      '{"lockfileVersion":3}',
    );
    await writeFile(
      join(directory, "workspace/package.json"),
      '{"name":"example"}',
    );
    await writeFile(join(directory, "node_modules/.package-lock.json"), "{}");
    assert.equal(await dependenciesCurrent(directory), false);
    await recordDependencies(directory);
    assert.equal(await dependenciesCurrent(directory), true);
    await writeFile(
      join(directory, "package-lock.json"),
      '{"lockfileVersion":3,"changed":true}',
    );
    assert.equal(await dependenciesCurrent(directory), false);
    await recordDependencies(directory);
    await writeFile(
      join(directory, "workspace/package.json"),
      '{"name":"example","version":"2"}',
    );
    assert.equal(await dependenciesCurrent(directory), false);
    await recordDependencies(directory);
    await invalidateDependencies(directory);
    assert.equal(await dependenciesCurrent(directory), false);
    await recordDependencies(directory);
    await rm(join(directory, "node_modules/.package-lock.json"));
    assert.equal(await dependenciesCurrent(directory), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("doctor checks only local model catalogs without credentials or redirects", async () => {
  const result = await inspectInstallation({
    environment: {
      OMNI_EXTRACTOR_BASE: "http://127.0.0.1:11434/v1",
      OMNI_LOCAL_TOKEN: "never-sent",
      OPENAI_API_KEY: "never-sent",
    },
    nodeVersion: "22.13.0",
    platform: "linux",
    runCommand: async () => ({ stdout: "tool available\n" }),
    inspectPort: async (port) => (port === 3006 ? "in_use" : "available"),
    inspectDependencies: async () => true,
    fetchLocal: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:11434/api/tags");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers, undefined);
      return new Response(JSON.stringify({ models: [{ name: "qwen3:0.6b" }] }));
    },
  });
  assert.equal(result.read_only, true);
  assert.equal(result.ready, false);
  assert.equal(
    result.checks.find((row) => row.name === "Local models").status,
    "ok",
  );
  assert.match(formatDiagnosis(result), /No process was stopped/);
  assert.doesNotMatch(formatDiagnosis(result), /never-sent/);
});

test("doctor refuses remote or credential-bearing extraction URLs before any request", async () => {
  for (const endpoint of [
    "https://api.example.com/v1",
    "http://secret:password@127.0.0.1/v1",
    "http://127.0.0.1/v1?key=secret",
  ]) {
    assert.throws(() => localModelURL(endpoint));
    let fetched = false;
    const result = await inspectInstallation({
      environment: { OMNI_EXTRACTOR_BASE: endpoint },
      nodeVersion: "20.0.0",
      runCommand: async () => {
        throw new Error("not installed");
      },
      inspectPort: async () => "unknown",
      inspectDependencies: async () => false,
      fetchLocal: async () => {
        fetched = true;
        throw new Error("unexpected");
      },
    });
    assert.equal(fetched, false);
    assert.equal(
      result.checks.find((row) => row.name === "Node.js").status,
      "error",
    );
    assert.equal(
      result.checks.find((row) => row.name === "Local models").status,
      "warning",
    );
    assert.doesNotMatch(formatDiagnosis(result), /password|api\.example\.com/);
  }
});

async function waitUntil(predicate, milliseconds = 7000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("The isolated startup fixture did not become ready.");
}

test(
  "bootstrap removes its temporary installer when the installer fails",
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "omni-installer-"));
    try {
      await mkdir(join(directory, "scripts"));
      await mkdir(join(directory, "bin"));
      for (const tool of ["cc", "make", "perl"])
        await writeFile(
          join(directory, "bin", tool),
          "#!/usr/bin/env bash\nexit 0\n",
          { mode: 0o700 },
        );
      await copyFile(
        resolve("scripts/bootstrap.sh"),
        join(directory, "scripts/bootstrap.sh"),
      );
      await writeFile(
        join(directory, "scripts/build-dir.mjs"),
        "process.stdout.write(process.cwd()+'/build');",
      );
      await writeFile(
        join(directory, "bin/curl"),
        '#!/usr/bin/env bash\nfor argument in "$@"; do destination="$argument"; done\nprintf "%s" "$destination" > installer-path\nprintf "#!/bin/sh\\nexit 7\\n" > "$destination"\n',
        { mode: 0o700 },
      );
      await assert.rejects(
        execute(
          "bash",
          [
            "-c",
            'command() { if [[ "$1" = -v && "$2" = cargo ]]; then return 1; fi; builtin command "$@"; }; export -f command; exec bash scripts/bootstrap.sh',
          ],
          {
            cwd: directory,
            timeout: 7000,
            env: {
              ...process.env,
              PATH: `${join(directory, "bin")}:${process.env.PATH}`,
            },
          },
        ),
        (error) => error.code === 7,
      );
      const installer = await readFile(
        join(directory, "installer-path"),
        "utf8",
      );
      await assert.rejects(readFile(installer), { code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "failed npm installation invalidates the previous dependency stamp",
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "omni-npm-failure-"));
    try {
      for (const path of ["scripts", "bin", "node_modules", ".omni/runtime"])
        await mkdir(join(directory, path), { recursive: true });
      for (const tool of ["cc", "make", "perl", "cargo"])
        await writeFile(
          join(directory, "bin", tool),
          "#!/usr/bin/env bash\nexit 0\n",
          { mode: 0o700 },
        );
      for (const name of ["bootstrap.sh", "dependency-stamp.mjs"])
        await copyFile(
          resolve("scripts", name),
          join(directory, "scripts", name),
        );
      await writeFile(
        join(directory, "scripts/build-dir.mjs"),
        "process.stdout.write(process.cwd()+'/build');",
      );
      await writeFile(join(directory, "package.json"), '{"workspaces":[]}');
      await writeFile(join(directory, "package-lock.json"), "{}");
      await writeFile(join(directory, "node_modules/.package-lock.json"), "{}");
      await writeFile(
        join(directory, ".omni/runtime/dependencies.sha256"),
        "obsolete",
      );
      await writeFile(
        join(directory, "bin/npm"),
        "#!/usr/bin/env bash\nexit 33\n",
        { mode: 0o700 },
      );
      await assert.rejects(
        execute("bash", ["scripts/bootstrap.sh"], {
          cwd: directory,
          timeout: 7000,
          env: {
            ...process.env,
            PATH: `${join(directory, "bin")}:${process.env.PATH}`,
          },
        }),
        (error) =>
          error.code === 1 &&
          /Dependency installation failed/.test(error.stderr),
      );
      await assert.rejects(
        readFile(join(directory, ".omni/runtime/dependencies.sha256")),
        { code: "ENOENT" },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

for (const { noOpen, web } of [
  { noOpen: false, web: true },
  { noOpen: true, web: true },
  { noOpen: true, web: false },
]) {
  test(
    `run.sh ${web ? "--web" : "native mode"} isolates pairing and ${noOpen ? "opens nothing with --no-open" : "opens only after readiness"}`,
    { timeout: 15000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "omni-startup-"));
      let child;
      try {
        for (const subdir of [
          "scripts",
          "build/debug",
          "services/collector/src",
          "bin",
        ])
          await mkdir(join(directory, subdir), { recursive: true });
        await copyFile(resolve("run.sh"), join(directory, "run.sh"));
        await copyFile(
          resolve("scripts/lifecycle.sh"),
          join(directory, "scripts/lifecycle.sh"),
        );
        await writeFile(join(directory, "events.jsonl"), "");
        const event = `import {appendFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; const event=(data)=>appendFileSync('events.jsonl',JSON.stringify(data)+'\\n');`;
        const service = (name) =>
          `${event} event({name:${JSON.stringify(name)},pairing:!!process.env.OMNI_PAIRING_SECRET,hash:process.env.OMNI_PAIRING_SECRET?createHash('sha256').update(process.env.OMNI_PAIRING_SECRET).digest('hex'):null});setInterval(()=>{},1000);`;
        await writeFile(
          join(directory, "scripts/bootstrap.sh"),
          "#!/usr/bin/env bash\nexit 0\n",
          { mode: 0o700 },
        );
        await writeFile(
          join(directory, "scripts/build-dir.mjs"),
          "process.stdout.write(process.cwd()+'/build');",
        );
        await writeFile(join(directory, "scripts/check-ports.mjs"), "");
        await writeFile(
          join(directory, "build/debug/omni-core"),
          `#!/usr/bin/env node\n${service("core")}`,
          { mode: 0o700 },
        );
        await writeFile(
          join(directory, "services/collector/src/server.mjs"),
          service("collector"),
        );
        await writeFile(
          join(directory, "scripts/desktop-fixture.mjs"),
          service("desktop"),
        );
        await writeFile(
          join(directory, "bin/npm"),
          "#!/usr/bin/env bash\nexec node scripts/desktop-fixture.mjs\n",
          { mode: 0o700 },
        );
        await writeFile(
          join(directory, "scripts/wait-ready.mjs"),
          `${event} import {readFileSync} from 'node:fs'; for(let i=0;i<200;i++){const events=readFileSync('events.jsonl','utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);if(['core','collector','desktop'].every(name=>events.some(e=>e.name===name))){event({name:'ready'});process.exit(0);}await new Promise(r=>setTimeout(r,10));}process.exit(1);`,
        );
        await writeFile(
          join(directory, "scripts/open-browser.mjs"),
          `${event} let input='';for await(const chunk of process.stdin)input+=chunk;event({name:'browser',hash:createHash('sha256').update(input).digest('hex'),address:process.argv[2]});`,
        );
        const lines = async () =>
          (await readFile(join(directory, "events.jsonl"), "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map(JSON.parse);
        child = spawn(
          "bash",
          [
            "run.sh",
            ...(web ? ["--web"] : []),
            ...(noOpen ? ["--no-open"] : []),
          ],
          {
            cwd: directory,
            env: {
              ...process.env,
              PATH: `${join(directory, "bin")}:${process.env.PATH}`,
              OMNI_PAIRING_SECRET: "inherited-must-not-leak",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        const finished = new Promise((done) => child.once("exit", done));
        await waitUntil(async () =>
          (await lines()).some(
            (row) => row.name === (noOpen ? "ready" : "browser"),
          ),
        );
        await new Promise((done) => setTimeout(done, 100));
        const events = await lines();
        assert.equal(
          events.find((row) => row.name === "core").pairing,
          !noOpen,
        );
        assert.equal(
          events.find((row) => row.name === "collector").pairing,
          false,
        );
        assert.equal(
          events.find((row) => row.name === "desktop").pairing,
          false,
        );
        if (noOpen)
          assert.equal(
            events.some((row) => row.name === "browser"),
            false,
          );
        else {
          assert.ok(
            events.findIndex((row) => row.name === "ready") <
              events.findIndex((row) => row.name === "browser"),
          );
          assert.equal(
            events.find((row) => row.name === "core").hash,
            events.find((row) => row.name === "browser").hash,
          );
          assert.equal(
            events.find((row) => row.name === "browser").address,
            "http://localhost:3006",
          );
        }
        assert.doesNotMatch(
          output,
          /[a-f0-9]{64}|inherited-must-not-leak|#connect=/,
        );
        child.kill("SIGTERM");
        await finished;
        child = undefined;
      } finally {
        if (child && child.exitCode === null) {
          child.kill("SIGTERM");
          await new Promise((done) => child.once("exit", done));
        }
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
