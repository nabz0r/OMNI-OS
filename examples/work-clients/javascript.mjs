// Configure this named client from Work. Never give it the owner credential.
export async function send({
  base,
  token,
  grant,
  message = "Prepare a synthetic project budget.",
}) {
  const url = new URL(base);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("The reference client requires a local OMNI gateway.");
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(grant ? { "X-Omni-Grant": grant } : {}),
    },
    body: JSON.stringify({
      model: "omni-synthetic",
      stream: false,
      messages: [{ role: "user", content: message }],
    }),
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  return {
    status: response.status,
    receipt: response.headers.get("x-omni-receipt"),
    body: await response.json(),
  };
}
