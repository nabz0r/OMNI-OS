import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export function connectionURL(address, secret) {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw new Error("The console address must be a local HTTP URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("The console address must be a local HTTP URL.");
  if (!/^[a-f0-9]{64}$/.test(secret))
    throw new Error("The temporary connection secret is invalid.");
  url.hash = `connect=${secret}`;
  return url.href;
}

export function browserEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) => !/(TOKEN|SECRET|API_KEY|PASSWORD)/i.test(key),
    ),
  );
}

export async function openBrowser(
  address,
  secret,
  {
    platform = process.platform,
    environment = process.env,
    launch = spawn,
    settleMs = 1500,
  } = {},
) {
  const url = connectionURL(address, secret);
  const command = {
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
    win32: ["rundll32.exe", ["url.dll,FileProtocolHandler", url]],
  }[platform];
  if (!command) throw new Error("Automatic browser opening is unavailable.");
  await new Promise((resolve, reject) => {
    let child;
    let timer;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) resolve();
      else reject(new Error("The browser could not be opened automatically."));
    };
    try {
      child = launch(command[0], command[1], {
        shell: false,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: browserEnvironment(environment),
      });
    } catch {
      finish(false);
      return;
    }
    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0));
    // Some Linux desktop launchers remain attached to the browser. Do not wait
    // for that browser to close, and never terminate it as part of core cleanup.
    timer = setTimeout(() => finish(true), settleMs);
    child.unref();
  });
}

async function readSecret(input) {
  let secret = "";
  for await (const chunk of input) {
    secret += chunk.toString("utf8");
    if (secret.length > 64)
      throw new Error("The temporary connection secret is invalid.");
  }
  return secret;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await openBrowser(process.argv[2], await readSecret(process.stdin));
  } catch {
    // Child-process exceptions can contain command arguments, including the
    // short-lived secret. Print only this fixed, non-sensitive fallback.
    process.stderr.write(
      "Automatic browser opening failed. Open the local console address and use .omni/runtime/admin-token to connect.\n",
    );
    process.exitCode = 1;
  }
}
