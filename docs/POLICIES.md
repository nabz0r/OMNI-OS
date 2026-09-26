<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Use OMNI

> **Guide + API contract** · Configure text and file rules, inspect decisions and understand the enforcement boundary.
<!-- /omni:header -->

# Policies: memory with an enforceable boundary

Memory answers “what may be shared?” Policies answer “may this request leave OMNI at all?” A valid memory permission never bypasses a content or file restriction. The Rust core makes the decision before provider egress; changing the interface or calling the gateway directly does not skip it.

This is an implemented request-filtering MVP for OMNI-mediated AI traffic. It is not a general web application firewall, a fleet management service, or a claim to be the first AI proxy.

## Pin a managed policy at startup

For 0.4.0 desktop or external-core deployment, place `OMNI_MANAGED_POLICY_FILE` in an administrator-controlled directory and pin its exact file bytes through `OMNI_MANAGED_POLICY_SHA256` in a separately protected launch configuration. Compute the SHA-256 after final formatting; whitespace changes alter the pin. Restart after an authorised update. The policy view reports `managed_pinned` separately from the semantic policy fingerprint.

A missing file, malformed pin, changed digest, oversized file, symlink or Unix group/world-writable file refuses startup. A pin without a file also refuses startup. Protect parent directories and the launch environment: an OS administrator or process owner who can replace both file and pin remains trusted. This is digest pinning, not a signed fleet rollout, freshness/expiry check or rollback protection. The native Android bootstrap does not consume desktop environment policy files. Mobile managed provisioning remains a deployment gate.

## Use it in the application

Open **Policies** in the navigation. Give the local policy a name, add content rules, select permitted file extensions and set request/file limits. Save to activate a new revision. Invalid expressions leave the saved revision unchanged and preserve the interface draft. Concurrent edits receive a conflict instead of silently replacing another session's policy; reload before editing again.

**Test saved policy** evaluates a sample locally, with optional text files. It sends nothing to a provider and creates no decision receipt. Unsaved edits are excluded. A real request also includes its model settings, conversation history and authorized memory, so a successful sample does not authorize a later request.

**Decision trail** shows the most recent 100 checks from a bounded history of 1,000. Expand a decision for its ID, policy layer, local revision, rule identifier, inspected size and file count. The managed baseline fingerprint is also available in the API. Allowed means the policy permitted the request, not that the model received it or completed it.

In the launcher, use **Attach text files**. Files remain in the current transient conversation and are checked again on each follow-up. A later policy change can therefore block a follow-up that carries an earlier file. Remove the file before sending, or start a new conversation when it is already in history. A failed send restores its draft and files. Changing destination, clearing the conversation or locking clears this transient context. Attachments do not become stored memories automatically.

## Two independent layers

| Layer            | Administration                                           | Persistence                                             | Effect                                              |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| Local            | Owner interface or owner-authenticated API               | SQLCipher, with increasing revision                     | Additional request restrictions                     |
| Managed baseline | Deployment operator supplies a validated file at startup | Operator-controlled file; compiled snapshot in the core | A mandatory baseline the local editor cannot weaken |

A request must pass both. The managed layer is evaluated first; the first violation identifies the responsible layer. There is no allow rule that overrides a deny, and no owner or memory-grant exception. Local rules may be relaxed by the owner within the managed baseline. In-flight requests already authorized are not recalled by a policy edit.

The example [organization policy](../infra/policies/organization.json) is complete and loadable. It allows four text formats, limits requests to 256 KiB and files to two of at most 50,000 bytes, and blocks two explicit text patterns. It is an example baseline, not comprehensive secret detection.

For the source-development stack, run from the repository root:

```bash
OMNI_MANAGED_POLICY_FILE="$PWD/infra/policies/organization.json" ./run.sh --web
```

The standalone core also reads this variable. Standalone **desktop** native startup forwards it to the embedded core. A desktop process launched by Finder or another graphical shell does not necessarily inherit your terminal environment; provision the service or launch environment deliberately. The Rust embedding API accepts `EmbeddedOptions.managed_policy`. The standard mobile application supports local policies but does not provision organization policies through MDM.

A configured file that is missing, oversized, malformed or invalid refuses startup. The file is limited to 128 KiB, has a closed schema, and is loaded once. To update the managed baseline, validate and replace the operator-owned file, then restart the managed process. Removing the environment setting removes this deployment constraint at the next launch; **the operator must protect the launch configuration as well as the file**. There is no remote policy refresh, signing infrastructure or fleet acknowledgement service in this MVP.

An enterprise deployment also needs OS access control and outbound network restrictions that prevent using another client or a direct provider connection. A person with administrator control over the device or process can replace OMNI. The baseline is enforced by this process, not by an unbreakable device boundary. Neither policies nor billing give an employer implicit access to personal memory.

## Content rule semantics

Each rule has an immutable-in-a-request identifier, a display name, a Rust regular expression, an enabled flag and one action:

- `block_match`: reject if the expression matches any part of the inspected combined text. All block rules run before require rules within that policy, regardless of display order.
- `require_match`: reject unless the expression matches somewhere in the inspected combined text. **Every** enabled require rule must match. This checks for text presence; it does not authenticate a classification or mean every field conforms to an allowlist.

Inspection recursively visits decoded JSON **string values**, including prompt/system content, history, tool arguments and metadata such as model names and roles. Values are joined with newlines. Block rules also inspect their concatenation without separators, catching some split-value patterns at the cost of possible false positives. JSON object key names, numeric values and booleans are not regex inputs. Authorized memory and attached file text are additionally inspected in their original text form, before quoting can conceal a newline or escape sequence. Inspection is bounded to 64 nesting levels.

Expressions are case-sensitive unless flags such as `(?i)` change that. Use `(?m)` for line anchors and `(?s)` when a dot should include newlines. Anchors apply to the combined inspected text, **not independently to each field**. Object iteration order is not a content contract: avoid cross-field positional expressions. Unicode normalization, semantic decoding, base64 decoding, OCR and recursive parsing of arbitrary JSON-inside-strings are not provided.

There are at most 32 rules per layer, 2,048 UTF-8 bytes per pattern, and a 256 KiB limit for each compiled expression and its lazy DFA cache. Disabled rules must still be valid. The [Rust regex syntax and complexity contract](https://docs.rs/regex/1.13.1/regex/) excludes backreferences and lookaround and bounds individual searches by pattern and input size. These bounds limit resource use; they are not a measured latency guarantee.

Examples for the editor:

| Intention                   | Action        | Pattern                              | Boundary                                           |
| --------------------------- | ------------- | ------------------------------------ | -------------------------------------------------- |
| Reject a project marker     | Block match   | `(?i)RESTRICTED_PROJECT`             | Literal text, including case variants              |
| Reject a private-key header | Block match   | `-----BEGIN [A-Z ]*PRIVATE KEY-----` | Does not identify every secret format              |
| Require a visible marker    | Require match | `(?i)classification:\s*public`       | A user can type this; it is not trusted provenance |

In JSON configuration files, escape backslashes: `"pattern": "classification:\\s*public"` represents a regex containing `\s` after JSON decoding. The repository example demonstrates the actual syntax. A broadly matching block can deliberately stop all traffic; preview and review rules before deployment.

## Inspectable files and size limits

| Extension     | Required media type |
| ------------- | ------------------- |
| `txt`, `log`  | `text/plain`        |
| `md`          | `text/markdown`     |
| `csv`         | `text/csv`          |
| `json`        | `application/json`  |
| `yaml`, `yml` | `application/yaml`  |

Names must be 1–180 UTF-8 bytes, may not start with a dot, and may not contain path separators, a colon or control characters. Extensions are compared case-insensitively; policy extension entries are lowercase. The declared media type must match the extension. Text must have no disallowed control characters, and common PDF, executable and ZIP signatures are rejected. JSON files must parse as JSON. There is no general file classifier, malware scan, CSV/YAML validation or proof that text cannot encode binary data.

Defaults permit four files of at most 100,000 UTF-8 bytes each, all seven listed extensions, and 1,048,576 bytes per complete outbound JSON request. Operators may set 0–8 files, 1–100,000 bytes per file and 1,024–1,048,576 request bytes. Zero files or an empty extension list disables attachments. Transport and launcher body/history limits still apply independently. File quoting and injected memory count toward the outbound request size; file formatting does not count as context-memory savings.

Provider-native opaque file IDs, remote file/image URLs, binary/image/audio/video blocks and recognized document attachment structures are rejected, including when nested inside tool results. OMNI does not download them. Plain URLs typed in text are still text: these policies do not control a provider's browsing tools or arbitrary external actions. Unknown provider extensions are not a guarantee of complete protocol coverage.

For chat/gateway requests, the recorded size is the serialized outbound JSON body. Capture checks the full source plus its actual extractor request envelope, even though extraction uses a bounded excerpt; its recorded size is this inspection object. MCP checks the query plus the memory result object. These measurements are not TCP/TLS bandwidth.

The explicit [reviewed conversation import](CONVERSATION_IMPORT.md) also validates its closed `omni-reviewed-conversation-v1` envelope and inspects the decoded message strings. JSON-escaped newlines must not conceal a match in those messages. The capture inspection size includes both the stored source and this decoded representation. This is a specific supported envelope, not general recursive parsing of arbitrary JSON-inside-strings. Import source labels are provenance claims, not authenticated user or provider identities.

## Integration contract

All policy administration routes require the **owner** credential. Integration/agent credentials cannot read or edit policy administration or decision history.

| Method | Route                     | Contract                                                                                                        |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/policies`           | Local revision, policy, optional managed baseline and SHA-256 fingerprint                                       |
| POST   | `/api/policies`           | `{ "expected_revision": 0, "policy": ... }`; validates atomically, 409 on a stale revision                      |
| POST   | `/api/policies/test`      | `{ "body": { "messages": [...] }, "attachments": [...] }`; tests the saved layers without egress or persistence |
| GET    | `/api/policies/decisions` | Recent metadata decisions, retained count, blocked count and retention limit                                    |

The launcher accepts an `attachments` array, including on user entries in its `history`:

```json
{
  "message": "Summarize this note.",
  "attachments": [
    {
      "name": "project.txt",
      "media_type": "text/plain",
      "text": "Public project update."
    }
  ]
}
```

The compatible `/v1/chat/completions` and `/v1/messages` gateways accept the same file objects as top-level `omni_attachments`, attached to the final user message. To carry historical files, place a closed `{ "type": "omni_text_file", "name": "project.txt", "media_type": "text/plain", "text": "Public update." }` block in a message's content array. OMNI consumes these fields and forwards provider-compatible text blocks containing quoted file data. It does not call a provider's upload API. Quoting states the intended data boundary; it does not prove a model will ignore malicious instructions.

Gateway and launcher policy denials return HTTP 403 with a reason code, policy layer, optional rule ID and decision ID, without matching text. No inference call or memory-disclosure receipt is created for that denied request. MCP `memory_search` returns a JSON-RPC error and excludes the memory result; its transport still follows the existing JSON-RPC response contract. Capture denial happens before contacting the local extractor or saving its source/fallback proposal.

Invalid request schemas, invalid grants and rejected authentication can fail earlier with their existing status codes; those do not create policy decisions. Discovery, local memory editing/proposals, and fixed-schema analytics are separate operations, not AI request content filtering. Responses are not filtered. Streaming requests pass policy checks before opening the upstream stream; response bytes retain the existing gateway contract.

## Storage and accountability

`request_policy` stores the local revision and validated document in SQLCipher. `policy_decisions` holds at most 1,000 metadata records and is also encrypted. Decisions contain no prompt, response, file name, matched excerpt or regex pattern. `policy_updated` and `policy_blocked` add bounded audit events. Administrative names and patterns are sensitive configuration and stay in the policy document.

Decision recording remains active when optional interaction history is disabled. Clearing interaction history does not clear policies or policy decisions. Retention is count-based, not time-based; a quiet installation can retain older decisions. There is no central log shipping or policy-decision export endpoint. These local records are not an independently tamper-evident compliance ledger. They never enter the differential-privacy collector.

## Acceptance and remaining work

Rust tests cover rule validation, precedence, file validation, encrypted persistence, conflicting updates, baseline enforcement, capture/MCP/gateway paths, blocked-provider non-delivery and bounded retention. `npm run test:policies` exercises the actual interface against an isolated core and a synthetic provider, including historical file revalidation and mobile layout. Native embedded-router tests cover policy persistence and managed denials through IPC. See [validation](VALIDATION.md) for observed results and package revisions.

Fleet policy distribution, trusted group identity, work/personal vault separation, signed policy rollout, revocation acknowledgements, response filtering, content parsers for additional formats and independent security assessment remain [roadmap work](../ROADMAP.md). The published 0.2.0 macOS/Android packages include this implementation; historical 0.1.0 installers do not. See [delivery](DELIVERY.md) for installation and upgrade boundaries.

<!-- omni:footer -->
---

**Continue reading** · [Bring your context](CONVERSATION_IMPORT.md) · [Run your AI workspace](ADMINISTRATION.md) · [The native workspace](../apps/desktop/README.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
