# Connect an application deliberately

OMNI does not need an interception certificate. Point a compatible client at its local gateway, or use its MCP memory tools. The browser extension captures visible conversation text only when its button is pressed; installation is described in `apps/extension/README.md`.

## Provider gateway

Start `./run.sh --web` with the intended provider base and model. API keys belong to the local process environment, never the frontend. The default endpoint is local Ollama. For a remote endpoint, the base must use HTTPS and be present in the configured allowlist. If using the VPN, start its client first and set `OMNI_SOCKS_PROXY` and `OMNI_VPN_REQUIRED=true` as described in [VPN.md](VPN.md).

The console can create a permission for selected confirmed memories, an exact provider base, and a lifetime of at most 24 hours. Copy its ID from the permissions view. Configure the integrated application's base URL as `http://127.0.0.1:3007/v1` and its API token from `.omni/runtime/agent-token`. Give it the `x-omni-grant` header only when that memory disclosure is intended. Without the header, the gateway forwards the request with no memory augmentation. A revoked or expired permission fails instead of silently retrying with memory.

Supported routes:

| Protocol | Route | Memory authorization |
|---|---|---|
| OpenAI Chat Completions | `/v1/chat/completions` | `x-omni-grant` for the configured `OMNI_LLM_BASE` |
| Anthropic Messages | `/v1/messages` | `x-omni-grant` for `OMNI_ANTHROPIC_BASE` |

Both routes accept ordinary JSON requests and preserve upstream event-stream bytes. Streaming usage is marked unknown locally; non-streaming usage comes from provider-reported counters. The elapsed-time measurement is time to response headers. Models and API keys remain provider-specific; these routes do not imply compatibility with every provider API.

## Memory tools over MCP

Send JSON-RPC requests to `http://127.0.0.1:3007/mcp` with the agent bearer token. The endpoint implements initialize, ping, tool discovery, memory search and memory proposals. It returns JSON responses over HTTP; it is not a stdio process.

`memory_propose` accepts a content string and always creates an unconfirmed proposal. `memory_search` accepts `query` and `grant_id`; its permission destination must be exactly `https://omni.local/mcp`. This URI names the local agent capability; the server makes no request to it. The owner creates that grant through the authenticated `/api/grants` API. The tool cannot confirm memories, create grants, change destinations or increase authority.

For development integrations, read the owner token from its local file in the owning process and submit this body to `/api/grants`:

```json
{"destination":"https://omni.local/mcp","scope":["*"],"expires_in_seconds":3600}
```

`*` means all confirmed memories within the context size limit, including memories confirmed later while the grant is valid. Prefer specific memory IDs when a task needs a narrower scope. The current release has one shared agent credential per installation; create separate installations for mutually distrusting agent principals. The grant is a bearer capability, not proof of the identity of a particular agent executable.

## Sources and memory entropy

Raw captured text stays in the encrypted `sources` table. Local extraction creates at most five proposals, linked to that source. Every edit preserves history until the memory or source is deleted. Confirmed, proposed, disputed and superseded states prevent unreviewed facts from silently becoming authorized context. The current retrieval is bounded lexical selection, not an identity embedding or a claim that a person's life can be reduced to a vector.

Provider responses are returned to the caller; they are not automatically saved as permanent memory. Capture or add a memory explicitly when persistence is intended. Deleting one derived memory retains a shared source while other memories still depend on it. Deleting `/api/sources/{id}` removes the whole source and its derived memories. Already disclosed data cannot be recalled from a provider.
