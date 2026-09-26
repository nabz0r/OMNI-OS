<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Build & operate

> **Integration contract** · Use the launcher, explicit API gateway or MCP tools with the correct authority.
<!-- /omni:header -->

# Connect an application deliberately

OMNI does not need an interception certificate. Use the desktop launcher, point a compatible client at the local gateway, or connect through its MCP memory tools. The browser extension captures visible conversation text only when its button is pressed; installation is described in the [extension guide](../apps/extension/README.md).

For the normal first launch, follow [Getting started](GETTING_STARTED.md). A standalone native app embeds its core and uses authenticated IPC; it exposes no HTTP gateway by default. The browser development stack opens through a single-use local pairing link, and `run.sh` explicitly connects its native development window to the same external services. Headless `--no-open` keeps manual owner-token entry available for that development stack.

The HTTP addresses and token files below belong to the explicit external gateway workflow. Installing a native desktop or mobile app alone does not start port 3007 or make its private vault available to browser extensions, MCP clients or another app. The reusable embedded Rust runtime has an opt-in loopback listener for a deployment that deliberately exposes one; the packaged bootstrap leaves it off. See [PLATFORMS.md](PLATFORMS.md).

## Desktop launcher and session context

The [shared native/browser interface](../apps/desktop/README.md) connects to the authenticated local core. Native IPC dispatches to the same routes and permission checks as the external HTTP service. **Ask with context** sends a message through `/api/chat` to the configured model. A selected permission controls which confirmed vault memories may augment the request. Without a permission, the model still receives the user's message and any included conversation history; it receives no vault-memory augmentation.

The launcher keeps its visible conversation in interface memory. Each follow-up includes up to ten previous complete user/assistant exchanges, bounded to 100,000 UTF-8 bytes of conversation text including the new message. It drops older exchanges when necessary. This is a content bound, not a total HTTP-payload limit; vault context has its own bound. Provider responses are not automatically promoted to permanent memory.

Changing the selected permission starts a new conversation. The interface also clears the conversation when refreshed state reveals a provider or model change, an invalid permission, or changed memories within its scope, including wildcard scope. Successful memory edits, deletions and grant revocations made in the interface clear the conversation immediately. Locking the session clears its token, turns and drafts and stops pending interface waits. Native work already dispatched may continue; reopening with **Unlock on this device** is an explicit interface action, not OS reauthentication. Closing the launcher alone preserves the conversation; reloading the interface does not.

Responses support Markdown tables and code blocks. Raw HTML is omitted and image markup is replaced with text, so a response cannot cause an automatic image fetch through this renderer. Links open only on user action, with `noopener noreferrer`. **Copy response** writes the original response text to the clipboard when the browser permits it.

Failures restore the submitted message for a manual retry unless a newer draft exists. Empty replies do not become history. **Stop waiting** aborts the local wait, not a provider's already received work. Retrying can produce another provider request; inspect **History → Requests** and **Disclosure receipts** when delivery is uncertain. Session resets, revocations and deletion cannot retrieve previously disclosed copies. Other applications using the gateway manage their own conversation histories; the desktop's reset behavior does not clear those clients.

## Provider gateway

Start `./run.sh --web`, then use **Models** to configure provider connections. Initial environment values seed the profiles on the first launch of that vault; subsequent edits are persisted locally and take precedence over those seed values. API keys entered in the console are write-only and encrypted in SQLCipher. The default endpoint is local Ollama. Remote bases must use HTTPS. An explicit `OMNI_UPSTREAM_ALLOWLIST` remains a hard deployment constraint; without it, an owner-created profile authorizes that destination. See the [administration guide](ADMINISTRATION.md) for discovery, settings and secret handling. If using the VPN, start its client first and set `OMNI_SOCKS_PROXY` and `OMNI_VPN_REQUIRED=true` as described in [VPN.md](VPN.md).

The interface can create a permission for selected confirmed memories, an exact provider base, and a lifetime of at most 24 hours. Retrieve its ID from the owner-authenticated `/api/state` response when configuring another client. Configure that application's base URL as `http://127.0.0.1:3007/v1` and its API token from `.omni/runtime/agent-token`. Give it the `x-omni-grant` header only when that memory disclosure is intended. Without the header, the gateway forwards the request with no memory augmentation. A revoked or expired permission fails instead of silently retrying with memory.

Supported routes:

| Protocol                | Route                  | Memory authorization                               |
| ----------------------- | ---------------------- | -------------------------------------------------- |
| OpenAI Chat Completions | `/v1/chat/completions` | `x-omni-grant` for the selected compatible profile |
| Anthropic Messages      | `/v1/messages`         | `x-omni-grant` for the selected Anthropic profile  |

Send optional `x-omni-provider: <profile-id>` to select an enabled profile of the matching protocol. Otherwise the gateway uses the primary profile if compatible, or the first enabled profile for that protocol. A permission must match the selected base exactly; selecting a different provider never broadens its scope.

Both routes apply the saved local and managed request policies before provider egress, including when `stream` is true. Supported text files use `omni_attachments` or historical `omni_text_file` content blocks; recognized opaque provider file IDs, remote file/image URLs and binary media blocks are refused. The [policy integration contract](POLICIES.md#integration-contract) defines payloads, limits and denial behavior.

Both routes accept ordinary JSON requests and preserve upstream event-stream bytes. Reported usage is extracted from non-streaming responses and supported SSE usage events when supplied. Missing counters remain unknown. The separate local request journal records time to response headers and total elapsed time, request/response body bytes, terminal status and supported token counters. These are payload sizes, not TCP/TLS wire measurements. Streaming cancellation can leave partial usage; the record retains its terminal status. DP observations remain separate from this operational journal. Models and API keys remain provider-specific; these routes do not imply compatibility with every provider API. The desktop launcher's bounded session-history behavior is separate from these pass-through protocol routes.

The native UI bridge returns bounded complete response bodies rather than incremental SSE events. This does not change the external gateway's streaming contract. Mobile has no bundled inference engine or system-wide network interception; other apps' conversations remain outside OMNI unless explicitly imported or routed through a separately configured gateway.

## Memory tools over MCP

Send JSON-RPC requests to `http://127.0.0.1:3007/mcp` with the agent bearer token. The endpoint implements initialize, ping, tool discovery, memory search and memory proposals. It returns JSON responses over HTTP; it is not a stdio process.

`memory_search` additionally applies content policy to its query and authorized result before returning memory; denial creates a metadata decision and no disclosure receipt. A valid grant cannot bypass that check.

`memory_propose` accepts a content string and always creates an unconfirmed proposal. `memory_search` accepts `query` and `grant_id`; its permission destination must be exactly `https://omni.local/mcp`. This URI names the local agent capability; the server makes no request to it. The owner creates that grant through the authenticated `/api/grants` API. The tool cannot confirm memories, create grants, change destinations or increase authority.

For development integrations, read the owner token from its local file in the owning process and submit this body to `/api/grants`:

```json
{
  "destination": "https://omni.local/mcp",
  "scope": ["*"],
  "expires_in_seconds": 3600
}
```

`*` means all confirmed memories within the context size limit, including memories confirmed later while the grant is valid. Prefer specific memory IDs when a task needs a narrower scope. The current release has one shared agent credential per installation; create separate installations for mutually distrusting agent principals. The grant is a bearer capability, not proof of the identity of a particular agent executable.

## Import, review and deletion

Use **Memory → Import text** to submit a note or conversation to `/api/capture`, or use the extension's explicit capture action. The desktop accepts up to 100,000 UTF-8 bytes and an optional source title. A policy check covers the full source and actual extractor request before any inference or persistence; a denial saves neither the source nor a fallback proposal. For an allowed capture, the raw source stays in the encrypted `sources` table. Extraction runs against the configured local extraction endpoint, examines at most the first 12,000 characters, and proposes at most five memories linked to the source. It does not fall back to a cloud model. If the extractor is unavailable or returns invalid output, the source remains saved and an excerpt becomes an unconfirmed proposal.

Review the proposals before confirming any of them. Confirmation alone does not create a permission, though an existing valid wildcard permission covers subsequently confirmed memories. Proposed, disputed and superseded memories are excluded from authorized context. The current retrieval is bounded lexical selection, not an identity embedding or a claim that a person's life can be reduced to a vector.

Every edit preserves history until the memory or source is deleted. The desktop requires a second **Confirm deletion** action after **Delete**; **Keep memory** cancels it. Deleting one derived memory removes that memory's history but retains a shared source while other memories depend on it. Deleting `/api/sources/{id}` removes the whole source and its derived memories. Already disclosed data cannot be recalled from a provider.

## Verify an integration

Exercise a contextual request and a follow-up, inspect the outgoing history and receipt, then change or revoke its permission and verify the next behavior. For the desktop, also check memory correction or deletion, unconfirmed import proposals, failure recovery, Markdown image suppression, lock/unlock isolation and the mobile layout. Use synthetic content in the isolated simulation stack.

The [desktop browser verification guide](../apps/desktop/README.md#browser-verification) describes the expanded automated flow and manual checks. These are procedures to run, not a claim that an integration or the latest changes have passed. Record outcomes and limitations in [VALIDATION.md](VALIDATION.md).

<!-- omni:footer -->
---

**Continue reading** · [How a request travels](ARCHITECTURE.md) · [Native platforms](PLATFORMS.md) · [Operate an installation](OPERATIONS.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
