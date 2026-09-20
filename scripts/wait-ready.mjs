const urls = process.argv.slice(2);
const deadline = Date.now() + 90000;
for (const url of urls) {
  let ready = false;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) { process.stderr.write(`Service not ready: ${url}. See .omni/runtime/*.log\n`); process.exit(1); }
}
