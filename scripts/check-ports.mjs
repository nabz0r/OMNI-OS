import net from "node:net";

for (const value of process.argv.slice(2)) {
  const port = Number(value);
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => server.close(resolve));
  } catch {
    process.stderr.write(
      `Port ${port} is already in use. Stop the earlier OMNI session or other listener before starting.\n`,
    );
    process.exitCode = 1;
    break;
  }
}
