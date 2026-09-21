# Historical Network Design Notes

> Historical note: these translated working notes preserve earlier proposals, alternatives, and claims as discussed at the time. They are not a description of delivered capabilities. For the current implementation and target architecture, read the [README](README.md) and [architecture guide](ARCHITECTURE.md).

## Recommended starting point

Recommended decision: build an application-level identity and context gateway, with a complementary network layer. The defensible value is control over what each AI learns about the user, when, and why.

Contradictions to resolve:

- WireGuard does not reveal the content of AI exchanges. `boringtun` provides the WireGuard protocol; its library does not provide the complete network and tunnel stacks on its own. They must be integrated with the operating system. A VPN serves as IP transport here; adding L2 does not provide the semantic access being sought. Cloudflare — BoringTun.
- An intercepted packet remains encrypted. TLS protects confidentiality and integrity between its endpoints; a network proxy therefore cannot add memory to an HTTPS prompt without becoming an authorized TLS endpoint. The same applies to QUIC. A CONNECT proxy is not enough. IETF — TLS 1.3; IETF — QUIC/TLS.
- macOS requires real native integration. An `NEPacketTunnelProvider` extension receives IP packets through a virtual interface, configures DNS and routes, and requires Network Extension authorization. Tauri can host the interface but replaces neither the extension nor its integration and signing. A simple installation must still obtain the necessary system permissions. Apple — NEPacketTunnelProvider.
- Biometrics should authorize access to a key, not act as the source of a derived password. Recommendation: a random 256-bit SQLCipher key protected by Keychain, biometric authorization when opening the vault, and explicit locking at logout. Secure Enclave protection must be designed around a supported key or cryptographic operation, rather than assumed to provide magical storage for an AES key directly usable by SQLite. Apple — Protecting keys with the Secure Enclave.
- A machine fingerprint is not a secret. SQLCipher advises against deriving a key solely from hardware identifiers. It encrypts storage, but the application must manage the keys and access decrypted content while using it. Zetetic — Database key material.

A feasible architecture without transparent TLS interception:

1. Explicit entry points: a Tauri launcher, a local API for compatible applications, and voluntarily installed connectors. Initially, only these interactions receive context enrichment and memory. Traffic from unintegrated third-party applications may be allowed, blocked, or routed, but its content remains opaque.
2. A local personal vault: events, memories, and preferences in SQLCipher. Replace the “single vector for an entire life” with structured memory and contextual vector representations: origin, date, confidence, work or personal domain, and permission to use it.
3. A local L7 engine: memory selection, preview of transmitted context, secret removal, provider-specific policy, budget, and model selection. The “LB” becomes routing based on capability, privacy, cost, and availability; the “WAF” becomes outbound data control and tool permissions.
4. Two separate network egress paths: the AI adapter sends only the authorized request to the selected provider; the analytics exporter receives only numeric objects that have already been bounded and randomized. The vault and memory engine expose no network API. For a boundary that can actually be enforced, use separate processes with system permissions; Rust modules alone are not proof of isolation.
5. An optional VPN as a second stage: a native network extension and `boringtun` connecting to an explicitly configured peer, with DNS and routing controls and leak prevention. Do not make the tunnel a prerequisite for demonstrating portable memory.

The correct privacy statement is: “History stays local; selected context is sent only to the chosen model; no prompt, response, or memory is sent to the analytics SaaS.” Guaranteeing that no raw content leaves the machine requires local inference. Transport encryption does not hide a prompt from the provider responsible for processing it.

Useful evidence: a network capture showing no prompts sent to the SaaS; rejection of analytics payloads containing text; a vault unreadable without its key; immediate revocation of memory permissions; clean recovery after provider failure; and no claim of enrichment for an unintegrated application.

_Sunday, 11:51 PM · Worked for 1m 27s_

## Integration surfaces

The concept is feasible as a local system service that mediates AI interactions, without requiring a VPN or a particular chat interface. It does, however, need several interception surfaces: no macOS API universally exposes every application's plaintext prompts and responses.

| Surface                                       | Available capture and intervention                                                                                                                                                                         | Actual limitation                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI, IDE, and agents: configured API endpoint | Read structured requests and responses, measure latency and exposed token counts, inject context, select the provider, and filter tools.                                                                   | The application must support a custom API URL or plugin. Preserve streaming, cancellation, and provider-specific fields. Officially documented example: the Claude Code gateway. Documentation.                                             |
| Web applications: extension and local service | Read conversations present in the DOM, enrich the composer before submission, and observe rendered responses. Instrumentation in the page's JavaScript context can intercept some calls before encryption. | Requires an adapter for each site. DOM changes, Workers, and uninstrumented network paths can reduce coverage. Chrome `webRequest` does not expose WebSocket messages or the content of a WebTransport session. Chrome scripts; webRequest. |
| MCP: proxy between an agent and its tools     | Observe and control the tool calls, arguments, results, and resources that actually pass through the proxy; provide memory and context.                                                                    | Does not automatically capture the conversation or model calls. The protocol deliberately keeps complete history on the host side. Current MCP architecture.                                                                                |
| macOS Transparent Proxy                       | Divert TCP and UDP flows according to rules, measure transport, relay, or block. A real system mechanism without a VPN tunnel.                                                                             | HTTPS and QUIC bodies remain encrypted. On its own, this provides neither prompt understanding nor enrichment. Content Filter is also read-only, with allow or block decisions. Apple — Network Extensions.                                 |
| Local TLS proxy with a CA, explicitly enabled | For compatible applications: terminate TLS locally, inspect and modify the application protocol in both directions, and establish a new TLS connection to the provider.                                    | Must be accepted by the application's TLS stack. Installing a CA does not necessarily overcome certificate pinning; proprietary protocols and QUIC require separate support. Apple — Identity Pinning.                                      |
| Native applications: Accessibility            | Read exposed UI attributes and modify some editable fields after user authorization.                                                                                                                       | Does not guarantee access to network exchanges, hidden context, tools, or unexposed content. Some applications do not implement the required attributes. AX reading; AX writing.                                                            |

Recommended foundation: a local Rust daemon with a policy and context engine, encrypted memory, and bidirectional adapters. The first three adapters would be an API proxy compatible with agents, a Chromium extension for two selected web applications, and an MCP proxy for tools. The extension communicates with the daemon through Native Messaging, with an authorized origin and message validation. Chrome — Native Messaging.

Each adapter must state its coverage: network only, visible conversation, full model request, or tools. The user should immediately see what the system actually understands.

The macOS network proxy then becomes a means of detection, attribution, and coverage control. The TLS proxy remains an optional compatibility mode for certain applications. Accessibility provides a UI supplement without claiming to reconstruct an entire conversation.

A central point for the product proposition: capturing a conversation in a SaaS application does not expose its system prompts, the provider's private memories, or agent calls executed exclusively on its servers. Local understanding must be built from exchanges that are actually observable, with provenance and a confidence level.

_Sunday, 11:55 PM · Worked for 44s_

## Where local understanding runs

The understanding engine runs on the Mac, in a background user service separate from network interception. The Rust daemon receives events from the adapters; a dedicated inference process uses the CPU and GPU through llama.cpp with Metal, or MLX on Apple Silicon. No model should run in the kernel. llama.cpp; MLX LM.

I would separate two schedules:

- Before sending: deterministic rules, memory retrieval, and brief classification when necessary. Keep a bounded latency budget; mandatory protections remain blocking.
- In the background: summaries, links between conversations, preference extraction, and usage measurements. Forward incoming streams immediately; do not rerun a complete analysis for every token.

For capacity planning, a 3-billion-parameter model at 4 bits theoretically requires 1.5 GB of weights; an 8B model requires about 4 GB, before quantization metadata, context caches, and buffers. These are capacity calculations, not benchmarks.

A reasonable product target: 16 GB of RAM with a specialized 1–3B model, a lightweight mode for 8 GB, and a 7–8B option for 24–32 GB. Limit context and concurrency, load models on demand, and reduce activity on battery power. Quality still needs to be measured on the actual tasks.

“Full Disk Access” does not mean full access to the machine. macOS separates file access, Accessibility, screen capture, microphone access, and input monitoring. Each surface exposes different data and requires its own permissions. Apple — Privacy & Security.

Even with every permission granted, these do not reveal processing performed exclusively on a server, internal prompts never sent to the Mac, or automatically expose TLS content.

_Sunday, 11:59 PM · Worked for 54s_

## Competitive context and independent authority

Private personal memory is already a competitive category. OMNI therefore needs to explain what additional authority it gives the user beyond retaining their history.

- Microsoft: memory of activity across the system. Recall, still described as a preview on Copilot+ PCs, stores and analyzes screenshots locally after opt-in. Users can pause, filter, and delete; screenshots and the vector database are encrypted, with Windows Hello access controls. Consequently, “remember my activity locally” is not enough to distinguish OMNI. Operating-system integration provides a considerable distribution advantage. Microsoft — Recall and privacy.
- Apple: personal context and actions integrated into devices. Apple describes an assistant that can search messages, email, and photos and act within applications, combining local processing and Private Cloud Compute. This places contextual understanding directly within its system and applications. Apple — architecture and features announced in June 2026. PCC specifically advertises computation without retention, no privileged access, and verifiable transparency; “private cloud” is therefore also an area receiving substantial investment. Apple Security — PCC.
- Google: personalization from services people already use. Personal Intelligence connects services including Gmail, Photos, YouTube, and Search through opt-in, with a choice of sources. Google distinguishes not training directly on source libraries from using some filtered interactions to improve its models. Its advantage is access to data already hosted there and distribution through Gemini. Google — Personal Intelligence.

My strategic interpretation: the opportunity to test for OMNI is personal authority independent of the provider—context portable across multiple AIs, permissions per agent and task, correctable memories, a record of disclosed information, and revocation of future access. Revocation cannot retroactively erase information a provider has already received.

MCP already supplies mechanisms for resource authorization and minimal scopes. OMNI can build on these, but they are not a standard for portable personal memory or a universal psychological identity. MCP — Authorization.

The decisive test: make three agents from different providers immediately more useful with the same controlled context, then remove a memory and demonstrate that it is no longer shared. That measures a concrete difference.

_12:03 AM_

## Proposed architecture before the VPN decision

Recommended architecture, subject to resolving the mandatory-VPN versus proxy-without-VPN contradiction:

1. macOS application and local services. Tauri 2 and Three.js for visualization, settings, and consent; a user-space Rust daemon for routing and sessions; separate processes for the SQLCipher vault, local inference, and analytics export. The product remains usable through integrated AI applications without imposing its launcher. A development interface at localhost:3006 accompanies the native application; it is not equivalent to an installed VPN.
2. Explicitly bounded interception. Initial complete coverage: a configurable API proxy for compatible CLIs and IDEs, a browser connector for two named and versioned sites, and an MCP proxy for tools. Each connector declares whether it covers transport, visible conversations, model requests, or tools. MCP does not automatically provide access to LLM history. Incompatible native applications remain marked unsupported. A macOS Transparent Proxy extension can later route TCP and UDP flows; it does not decrypt TLS. Apple — Network Extensions.
3. Real providers. An Anthropic Messages adapter and an OpenAI-compatible API adapter for local engines, preserving provider parameters without destructive normalization. Bind the local endpoint to 127.0.0.1, require token authentication, store cloud keys in Keychain, and explicitly allow destination domains. The understanding model runs locally through llama.cpp and Metal, with a versioned download and verified digest, followed by inference in a process without network access. If the model is missing, use an explicit degraded mode, never a simulated response.
4. Streams and permissions. Relay SSE and cancellation with bounded buffers; preserve opaque blocks, tool identifiers, and provider errors. Do not switch models automatically after a response begins; retry before the first event only when safe. Enrich before sending, with rules per application, provider, and personal or work context. Extract memory in the background; do not exhaustively reanalyze every token. Distinguish provider-reported values, local measurements, and estimates.
5. Enforceable privacy. A random SQLCipher key protected by Keychain, with biometric authorization for access. Isolate the vault and inference without network access in signed macOS helpers; give the AI gateway and analytics exporter separate egress paths. The SaaS accepts only the bounded, randomized analytics schema, with no free text. This replaces the contradictory requirement that “only DP has network access.” The promise: no raw content sent to the OMNI SaaS; the selected provider receives authorized context.
6. Launch and distribution. `run.sh` checks dependencies, models, and ports, starts the components, and checks readiness. `start_network.sh` manages the local gateway; WireGuard mode is enabled only if selected, with a real remote peer and explicit configuration. BoringTun supplies the protocol, not the entire network integration. BoringTun. Ship a signed and notarized macOS application; request system permissions when needed.

Minimum validation: real cloud and local requests, streaming and cancellation, MCP tools, rejection of text in analytics schemas, the DP budget, a locked vault, no network egress from workers, disconnect and recovery, clean installation, permission removal, and uninstallation. Make no claim of universal coverage, psychological guarantees, or absolute privacy.

_12:08 AM · Worked for 51s_

## Revised proposal: a functional VPN

The VPN becomes a functional component, with two macOS execution modes sharing the same Rust engine.

- Client: integrate `boringtun::noise::Tunn`, with a UDP loop, WireGuard timers, inbound and outbound packet handling, and counters. In development, use a `utun` adapter launched explicitly with administrative privileges. For distribution, use a Swift `NEPacketTunnelProvider` adapter calling Rust through FFI and `packetFlow`, packaged as a System Extension. BoringTun provides the protocol, not all this integration. BoringTun.
- Signing: direct distribution on macOS requires Developer ID, a profile containing `packet-tunnel-provider-systemextension`, signing of all components, notarization, and user authorization. Apple reserves macOS packet tunnels packaged as App Extensions for the App Store. Without an Apple identity, deliver a development build and the `utun` CLI client; ad-hoc signing does not establish availability of the privileged extension. Apple — TN3134.
- Linux server: a kernel WireGuard peer, a dedicated network namespace, forwarding and NAT rules toward the public interface, and a TCP/SOCKS5 relay accessible only at the private WireGuard address. Keep the HTTPS analytics API in a separate service.
- Precise split tunneling: route only OMNI's private subnet through `utun`. The local AI proxy opens provider connections through the private relay; TLS remains established between the local client and the provider. Avoid global routes to provider IPs, which are often shared and would affect other applications. The server relays TLS bytes without analyzing prompts.
- Honest bootstrapping: `run.sh` starts the interface, vault, local engine, and development SaaS without a peer. Show an explicit unconfigured VPN state; requests requiring that transport wait for configuration. `start_network.sh` requires a reachable UDP endpoint, the server's public key, and an assigned client address. After deployment, the server generates an enrollment file containing its actual configured endpoint details; no invented endpoint.
- Validation: an isolated Linux test with a BoringTun client and kernel peer in two namespaces; handshake, bidirectional traffic, a TLS request through the relay, reconnection, rejection of an incorrect peer, and no direct fallback during an outage. A macOS `utun` test completes this verification.
- Resource efficiency: event-driven collection, small batches of conventional statistics, models unloaded when idle, bounded queues, and keepalives disabled unless a demonstrated need exists. No quantum computation is claimed.
