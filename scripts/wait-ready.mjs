import { pathToFileURL } from "node:url";

export async function waitForServices(
  urls,
  {
    timeoutMs = 90000,
    intervalMs = 250,
    fetchService = fetch,
    isAlive = () => true,
  } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("Startup timeout must be a positive number.");
  const pending = new Set(urls);
  const deadline = Date.now() + timeoutMs;
  while (pending.size && Date.now() < deadline) {
    if (!isAlive())
      throw new Error(
        "A launched service stopped before becoming ready. See .omni/runtime/*.log",
      );
    await Promise.all(
      [...pending].map(async (url) => {
        try {
          const response = await fetchService(url, {
            signal: AbortSignal.timeout(
              Math.max(1, Math.min(1500, deadline - Date.now())),
            ),
          });
          await response.body?.cancel();
          if (response.ok) pending.delete(url);
        } catch {}
      }),
    );
    if (pending.size)
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(intervalMs, Math.max(0, deadline - Date.now())),
        ),
      );
  }
  if (!isAlive())
    throw new Error(
      "A launched service stopped during startup. See .omni/runtime/*.log",
    );
  if (pending.size)
    throw new Error(
      `Service not ready: ${[...pending].join(", ")}. See .omni/runtime/*.log`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pids = (process.env.OMNI_SERVICE_PIDS ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  if (pids.some((pid) => !Number.isSafeInteger(pid) || pid < 1))
    throw new Error("Invalid service process identifier.");
  const isAlive = () =>
    pids.every((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return error.code === "EPERM";
      }
    });
  try {
    await waitForServices(process.argv.slice(2), { isAlive });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
