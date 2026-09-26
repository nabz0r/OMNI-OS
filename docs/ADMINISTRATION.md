<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Use OMNI

> **Guide** · Manage connections, models, history, usage, exports and local settings.
<!-- /omni:header -->

# Administration console

OMNI's console manages the local gateway, its provider connections and the evidence produced by requests that pass through it. Provider settings, credentials, interaction metadata and audit events persist inside the encrypted SQLCipher vault. The native console reads them through authenticated IPC to its embedded Rust core; the browser development console uses authenticated loopback HTTP. Neither retrieves an account-wide history from OpenAI, Anthropic or a browser.

This document describes the implemented administration features. See [Integrations](INTEGRATIONS.md) for the gateway and capture interfaces, [Privacy](PRIVACY.md) for analytics accounting, and [Security](SECURITY.md) for the broader trust boundaries.

## Work authority, saved conversations and recovery

The **Work** view manages installation enrollment, named client access, an optional local client gateway, explicitly opted-in conversation continuity and encrypted recovery. Read [Work](WORK.md) and [Recovery](RECOVERY.md) for the owner-only endpoints, role preservation, retention, retry and recovery boundaries. Ordinary History exports still exclude conversation bodies and provider keys; recovery archives deliberately include encrypted vault content and provider credentials.

## Using the console

Open the native application or follow the [repository development instructions](../README.md). Native startup provisions its device session and opens no HTTP listener. Work can explicitly open a narrow approved-client gateway; closing the interface session does not stop that gateway. After an explicit interface lock, use **Unlock on this device** to reopen it; this does not perform OS authentication. The browser development address is `http://localhost:3006`, with its external core normally on loopback port `3007`. Normal browser opening pairs automatically once; manual owner-token entry remains available for expired links or headless sessions. [Deployment modes →](PLATFORMS.md)

| View        | What it controls or shows                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Models      | Saved provider profiles, their default model, credentials, manual rates and a timestamped connection check. |
| History     | Individual launcher, gateway and local extraction requests, with metadata and lifecycle status.             |
| Usage       | Retained request totals, observed tokens, application payload bytes and estimates with coverage.            |
| Logs        | Structured local application audit events.                                                                  |
| Settings    | Metadata recording, retention, local extraction, configuration export and read-only runtime policy.         |
| Permissions | Grants and disclosure receipts governing selected memory.                                                   |

Add or edit a connection in **Models**, check the connection, select a model, and choose **Use by default** when it should become the launcher default. A catalog response does not prove that every listed model will accept an inference request. The first real request supplies that evidence in History.

History and Logs support search, provider filters, time windows and pagination. History adds a status filter; Logs adds a severity filter. Open a History row to inspect its complete metadata. **Refresh** retrieves current service state.

CSV and JSON exports from History and Logs contain only the current page of metadata. Usage exports contain per-model totals for the selected period. Configuration export excludes saved provider credentials and local authentication tokens, but still contains endpoint addresses and operational settings. These files are outside SQLCipher encryption and are not complete memory or vault backups.

Browser mode uses a normal download. Native desktop saves in `Documents/OMNI`, creating a distinct filename if a file already exists. Mobile opens the system share sheet with temporary access to a private export file and no automatic recipient. The interface acknowledges opening the share sheet, not successful saving: cancelling it does not export to a destination. The native bridge accepts bounded JSON/CSV exports only, with an `omni-` filename and a two-MiB limit; it is not arbitrary filesystem access. A chosen receiving app controls its copy afterward.

## Request policies

**Policies** adds a content-rule editor, text-file allowlist, request/file limits, saved-policy tester, managed baseline inspector and decision trail. The owner may edit the local layer; an operator-provisioned layer is read-only and remains mandatory. The Rust core enforces both before sending requests, including history and authorized memory. A stopped request appears in the policy trail rather than creating a successful provider interaction.

Decisions are encrypted and limited to the last 1,000, independent of optional interaction journaling. Clearing interaction history preserves policies and decisions. The tester is local and uses the saved revision; unsaved changes do not affect it. The managed baseline is provisioned through a startup file, not a fleet dashboard. [Full guide and API](POLICIES.md).

## Provider profiles and credentials

A profile has a generated `id`, a human-readable `label`, `kind`, `base_url`, default `model`, `enabled` flag, optional credential, optional manual rates and its last discovery result. Supported kinds are `ollama`, `openai`, `anthropic` and `compatible` for an OpenAI-compatible API. Up to 32 profiles are supported.

Provider URLs must use HTTPS, except for explicitly local loopback HTTP. URL credentials, query strings and fragments are rejected. The `ollama` kind requires a loopback destination because its discovery also uses native local endpoints. The base URL includes the API prefix, such as `https://api.openai.com/v1` or `http://127.0.0.1:11434/v1`.

The first initialization seeds profiles and extraction settings from the runtime configuration: explicit options for a standalone native app, environment values for the external development core. Subsequent starts preserve settings saved in the vault. Changing an environment variable does not overwrite an existing profile or reconfigure the native bootstrap. Deployment network policy remains separate and authoritative. Desktop native defaults point to Ollama; mobile starts with an unconfigured remote profile and requires a credential and model choice.

The API returns `has_api_key`, never the saved key. On a profile update:

- Omitting `api_key` preserves the existing key when the destination is unchanged.
- Supplying `api_key` replaces it. Supplying `clear_api_key: true` removes it.
- Setting and clearing a key in the same request is rejected.
- Changing `base_url` clears the old key. A new key can be explicitly supplied in the same update.

The editor therefore starts with an empty credential field even when a key is saved. Stored keys are encrypted at rest and necessarily available to the core while it authenticates upstream requests. This is not hardware isolation from the running process or protection against a compromised owner session.

The primary provider must stay enabled and have a model selected. Select another primary provider before deleting it or disabling it. Deleting a profile removes its saved credential from the current configuration; historical metadata and disclosure receipts remain. It neither revokes the upstream API key nor deletes provider-side data.

### Discovery and model status

**Check connection** makes an authenticated request to the profile's `/models` endpoint. For Anthropic it requests a catalog with `limit=1000`. For a local Ollama profile it also queries `/api/tags` and `/api/ps`, distinguishing installed model names from models reported as currently loaded. Catalogs are bounded to 1,000 identifiers, and each discovery HTTP request has an eight-second timeout and a one-MiB response limit.

Discovery records `status`, `checked_at`, `models`, `loaded_models` and a sanitized `error`. Status is `not_checked`, `available`, `unavailable` or `auth_error`. The console also displays disabled and policy-blocked profiles distinctly. Changing the destination, provider kind or credential invalidates the previous discovery result.

Remote model catalogs do not reveal GPU occupancy, local residency or the user's activity on the provider's website. An Ollama loaded-model result is an observation at `checked_at`, not a continuing monitor. Discovery does not download models or create cloud credentials.

### Routing and permission boundaries

The launcher can select a profile through `POST /api/chat` using `provider_id`; omission selects the configured default. Compatible gateway clients can select a profile with `x-omni-provider`. Without that header, the gateway uses the primary profile when its protocol matches, otherwise the first enabled profile supporting that protocol. A disabled or incompatible explicit profile is rejected.

Choosing a provider does not authorize memory disclosure. A grant must still match the actual destination, scope and lifetime before selected memory is injected. A saved profile or successful probe does not create a grant. Revoking a grant stops subsequent authorized disclosures; it cannot retract data already handed to the HTTP client or retained by a provider.

An explicitly configured upstream allowlist remains binding. The UI cannot bypass it by creating a profile. Runtime networking ignores inherited proxy settings, uses the explicitly configured SOCKS proxy for remote providers when present, and refuses required-VPN operation without that proxy. Loopback extraction uses its separate local client. The runtime panel is configuration evidence, not a WireGuard handshake or tunnel-health proof; see [VPN](VPN.md).

## Interaction history

The interaction ledger records model exchanges initiated through the launcher, provider-compatible gateway or local capture extractor. It is separate from memory sources, disclosure receipts and the observations used for differential privacy. Requests rejected before an exchange starts are not guaranteed to create a History row; History is not a complete security-access log.

Each row contains provider identity and display name, model, destination, operation (`chat`, `gateway` or `capture`), protocol (`openai`, `anthropic` or `local`), whether streaming was requested, optional grant and receipt identifiers, timestamps, timing, token counters, byte counters and a sanitized error code. It contains no prompt, generated reply, API key or raw provider error body.

Dates are stored as UTC ISO timestamps. The console formats them for the browser's locale and time zone. The provider name and manual rate snapshot describe the request when it started; changing a profile later does not rewrite old rows.

| Status      | Meaning                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| `pending`   | The exchange was recorded but has not reached a terminal state.                       |
| `streaming` | Upstream headers arrived for a streaming request; the exchange is still open.         |
| `succeeded` | The tracked response completed successfully under the route's checks.                 |
| `failed`    | An upstream error, invalid response, timeout or size limit ended the exchange.        |
| `aborted`   | The exchange was interrupted, including a dropped client response or process restart. |

`streaming: true` describes the requested mode; it is distinct from the current lifecycle `status`. HTTP status can be present even when the final interaction fails. Missing HTTP status means no upstream status was recorded, not HTTP success. A capture extractor can fail while OMNI still saves a source excerpt as a reviewable proposal; the extractor's row remains failed.

Terminal records are immutable. A late stream cleanup cannot replace a successful result or recreate a cleared row. On core startup, retained incomplete exchanges become `aborted` with `process_restarted`, preserving any partial counters already recorded. A sudden crash may occur before the latest in-memory counters are persisted.

Response handling is bounded: ordinary provider bodies are limited to eight MiB, extraction bodies to 256 KiB and streaming bodies to 32 MiB. Streams have a 45-second idle timeout; the HTTP client also has its overall request timeout. SSE bytes are forwarded without rewriting the payload. A bounded ephemeral line buffer reads usage events; conversation text is not written to the ledger.

Recognized application errors inside a stream produce `failed` with `upstream_stream_error`, even after HTTP 200. For the supported OpenAI and Anthropic stream protocols, EOF without the expected completion marker produces `upstream_stream_incomplete`. These classifications retain observed partial counters and do not persist the provider's error message.

### What the measurements mean

| Field                      | Measurement                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request_bytes`            | Size of the exact serialized JSON body prepared for the upstream request, after context injection. The same bytes are passed to the HTTP client. |
| `response_bytes`           | Response body bytes actually received by the core; an interrupted response can have a partial count.                                             |
| `context_bytes`            | Increase in serialized request size caused by memory injection, including its wrapper and JSON escaping.                                         |
| `source_bytes_baseline`    | UTF-8 length of the unique stored sources behind the selected memories; unknown when no such comparison exists.                                  |
| `header_latency_ms`        | Elapsed time from exchange tracking to receipt of upstream headers.                                                                              |
| `total_latency_ms`         | Elapsed time from exchange tracking to the recorded completion or interruption.                                                                  |
| `estimated_context_tokens` | `ceil(context_bytes / 4)`, a rough byte-derived estimate.                                                                                        |
| `estimated_source_tokens`  | `ceil(source_bytes_baseline / 4)` when the source baseline is known.                                                                             |

`request_bytes` is recorded before the network operation and does not prove that the provider received every byte. These are application payload measurements, excluding HTTP headers, TLS records, VPN overhead and retransmissions. They are not device-wide bandwidth counters or a network throughput measurement.

Context comparison computes `source_bytes_baseline - context_bytes` and its percentage of the source baseline across comparable records. Multiple selected facts from one source count that source once. The comparison can be negative when the injected context is larger. It does not prove bytes saved on the wire: the baseline source might never otherwise have been transmitted. It also does not establish equal answer quality, token savings, lower billing or a lossless compression ratio.

### Observed tokens, unknown values and cache accounting

Provider counters remain separate from byte-derived estimates:

- `input_tokens` is normalized to total input, including cache reads and writes when those values are known.
- `output_tokens` records provider-reported output.
- `cached_tokens` and `cache_write_tokens` are subsets of input, not additional tokens to add again.
- `total_tokens` uses the reported total or a total derived from compatible known input and output counts.

OpenAI-style usage is read from `prompt_tokens`, `completion_tokens`, `total_tokens` and supported cache fields. Anthropic reports uncached input separately, so its input total requires `input_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`. Streaming usage can arrive across successive events. The parser retains valid observed values without turning a partial subtotal into a complete one.

Unknown or invalid metrics remain JSON `null`. They are not zero, and the UTF-8 estimates do not fill them in. A supported protocol can identify an inapplicable cache-write category as zero; an unknown compatible provider cannot inherit that assumption. Missing or oversized usage events may therefore leave counters unavailable even when the response itself completes.

Usage totals sum known observations and include `token_observations` counts for `input`, `output`, `cached`, `cache_write` and `total`. A sum with partial coverage describes the observed subset. If no record supplies a metric, its aggregate remains `null`. Total interactions, failed requests and payload bytes are still counted independently of token availability.

### Manual cost estimates

Rates are optional USD amounts per million tokens: `input_per_million`, `output_per_million`, `cached_input_per_million` and `cache_write_input_per_million`. Input and output rates are required when configuring a rate object. Cache rates may be absent. Values must be finite, non-negative and no greater than 1,000,000.

OMNI snapshots the profile's rates when the requested model matches the profile's configured model. A request that overrides it with another model receives no rate snapshot and no cost estimate. Changing the profile's model clears its rates unless replacement rates are explicitly supplied in the same update. Create separate profiles or update rates deliberately when models have different prices; there is no automatic price lookup or tariff validation against a provider's current prices.

For a fully accounted request, with input `I`, output `O`, cache reads `R` and cache writes `W`, the estimate is:

```text
uncached_input = I - R - W
estimated_cost = (
    uncached_input * input_rate
    + O * output_rate
    + R * cached_input_rate
    + W * cache_write_input_rate
) / 1_000_000
```

The estimate stays `null` if required counts are unknown, cache subsets are inconsistent or a positive cache category has no configured rate. A known zero cache count needs no cache rate. Discounts, batch tariffs, account credits, other billable services and provider invoice adjustments are not modeled.

Aggregate cost reports include `priced_interactions`. A partial sum is not the cost of all requests. An estimate of zero is distinct from an unavailable estimate. Neither individual nor aggregate estimates are invoices.

## Audit events and retention

Logs are structured application events, not operating-system logs, browser history or freeform server output. Implemented events cover memory and source changes, grant creation and revocation, captures, analytics consent and report actions, provider changes and probes, settings changes, startup recovery, explicit history clearing, policy changes and policy blocks. `policy_updated` stores the rule count; `policy_blocked` references the metadata decision ID without retaining its matched text.

An event has `id`, `created_at`, `action`, `level` and a closed `details` object. Allowed details include identifiers, a model name, a count, enabled state, retention days, HTTP status and a sanitized error code. Arbitrary message, prompt, response and credential fields are excluded. The API supports `info`, `warning` and `error` filters; severity is derived from the recorded action and structured outcome.

The ledger is not a cryptographically signed, append-only audit service. An actor controlling the running core or its vault key can modify local data. It does not assert that every denied HTTP request or device action has been recorded.

Settings persist `history_enabled` and `history_retention_days`. Retention defaults to 30 days and accepts 1–365 days. Turning interaction recording off prevents new interaction entries; it does not stop model requests, delete previous entries or disable audit events. Exchanges already tracked can finish their existing records.

The retention window applies separately to interaction start times and audit event timestamps. Pruning runs on startup, relevant journal reads and writes, and a settings update. It is not a separate continuously running cleanup scheduler. A period of `all` means all currently retained records, not all activity since installation.

**Clear interaction history** deletes the activity ledger after console confirmation. It leaves memories, sources, grants, disclosure receipts, audit records, DP observations, prepared reports and the privacy budget intact. It adds a `history_cleared` audit event. Pending response handlers cannot recreate deleted interaction records.

Deletion removes records from the current database's logical history. It does not promise secure erasure of backups, filesystem snapshots or storage media. Metadata exports also have their own lifecycle outside the vault.

## Local administration API

All router endpoints in this section require `Authorization: Bearer <owner-token>`. Native `core_request` validates its main-window owner session and supplies that bearer to the shared router; the application exposes no HTTP listener by default. The restricted agent token cannot administer providers or read the journal. On an explicitly exposed HTTP service, a browser's `Origin` must match an allowed origin. CORS is not a substitute for authentication. JSON mutations use `Content-Type: application/json`.

| Method and path                  | Result                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/policies`              | Local revision, local policy and optional read-only managed baseline.                      |
| `POST /api/policies`             | Validate and replace the local policy using `expected_revision`; stale edits return `409`. |
| `POST /api/policies/test`        | Evaluate the saved layers locally; no provider egress or decision persistence.             |
| `GET /api/policies/decisions`    | Latest 100 decisions from the last 1,000 retained metadata records.                        |
| `GET /api/admin`                 | `{settings, providers, runtime}`; profiles are redacted.                                   |
| `PATCH /api/admin/settings`      | Updated settings object.                                                                   |
| `POST /api/providers`            | Create a profile; returns the redacted profile.                                            |
| `PATCH /api/providers/{id}`      | Update a profile; returns the redacted profile.                                            |
| `DELETE /api/providers/{id}`     | Remove a non-primary profile; `204` on success.                                            |
| `POST /api/providers/{id}/probe` | Perform discovery; returns the profile with its recorded result.                           |
| `GET /api/interactions`          | Paginated interaction metadata.                                                            |
| `GET /api/interactions/{id}`     | Complete record, or `404` if absent or no longer retained.                                 |
| `DELETE /api/interactions`       | Clear interaction history; `204` on success.                                               |
| `GET /api/usage`                 | Usage totals, model groups and context comparison for a period.                            |
| `GET /api/logs`                  | Paginated structured audit events.                                                         |

There is no separate `GET /api/providers`: read profiles from `GET /api/admin`. A probe request can return HTTP success while its profile says `unavailable` or `auth_error`; inspect `status` and `error` rather than treating the probe route's HTTP result as provider availability.

### Settings and profile payloads

Settings patches accept only these optional fields:

```json
{
  "history_enabled": true,
  "history_retention_days": 30,
  "extractor_base": "http://127.0.0.1:11434/v1",
  "extractor_model": "qwen3:0.6b",
  "primary_provider_id": "default"
}
```

The extractor endpoint must remain loopback. It never falls back to a cloud provider. Select an actually installed compatible model; the example identifier is not an installation instruction. No local model is bundled in the mobile package. Without a compatible local service, a capture saves its source and proposes an excerpt. Changing extraction settings affects future captures, not facts already saved.

A minimal local profile creation payload is:

```json
{
  "label": "Local writing model",
  "kind": "ollama",
  "base_url": "http://127.0.0.1:11434/v1",
  "model": "qwen3:0.6b",
  "enabled": true
}
```

Profile patches additionally accept `api_key`, `clear_api_key`, `rates` and `clear_rates`. Omitting `rates` preserves the existing object when the model is unchanged; changing the model without replacement rates clears the old rates. `rates: null` or `clear_rates: true` removes rates explicitly. Setting and clearing rates simultaneously is rejected. Unknown settings or profile fields are rejected rather than silently persisted.

Redacted profile responses include `id`, `label`, `kind`, `base_url`, `model`, `enabled`, `has_api_key`, `rates`, `status`, `checked_at`, `models`, `loaded_models`, `error` and `policy_allowed`. Runtime output includes the address or `in-process` transport, actual platform key-storage label, simulation flag, configured network policy and collector address, without bearer tokens or proxy credentials. Embedded mode has `listen_address: null`. `analytics_configured` states whether a collector destination exists; it does not attest to that collector's health.

### Filters, pagination and usage responses

History accepts `provider_id`, `status`, `model`, `search`, `period`, `limit` and `offset`. Logs accepts `provider_id`, `action`, `level`, `search`, `period`, `limit` and `offset`. The search parameter is **`search`**, not `q`.

`period` accepts `24h`, `7d`, `30d` or `all`. These are rolling windows measured by the service clock. History and Logs default to `all`; Usage defaults to `7d` and accepts only `period`. The console initially selects seven days.

`limit` defaults to 50 and must be 1–100; `offset` defaults to zero. Invalid values are rejected. The list response is `{items, total, limit, offset}`. Rows sort by timestamp descending, then ID descending. Each History item is already the full metadata record. Offset pagination is not a frozen snapshot: new requests or retention cleanup can change subsequent pages.

Search is a case-insensitive literal substring over selected metadata. History searches provider ID, provider name, model and status. Logs searches action, provider ID, model and entity ID. `%` is not a wildcard; prompt and reply contents are unavailable to search. Exact filters can be combined with search.

The usage response has these top-level fields:

```text
period, from, until
totals: interaction/status counts, payload bytes, nullable token sums,
        token_observations, nullable estimated_cost/cost_currency,
        priced_interactions
models: [{provider_id, provider_name, model, totals}]
context_comparison: interactions, context_bytes, source_bytes_baseline,
                    byte_reduction, reduction_percent, measurement
token_estimation: "ceil(UTF8_bytes/4); not provider usage"
cost_basis: "manual_rate_snapshots; not a bill"
```

`from` is `null` for `all`. Models are grouped by both provider ID and model name, so two separately configured connections are not merged into one provider. The comparison's `measurement` is `selected_context_vs_source_bytes`.

## Operational boundaries

The journal stays local and encrypted at rest. It is not the payload sent to the analytics collector. The collector receives only the separately prepared, consented and noised analytics DTO; clearing or disabling History cannot reset its privacy accounting.

The standalone native app has no collector configured and does not launch one. Enabling analytics, preparing a report and sending one fail clearly in that configuration before any privacy-budget spending. Personal memory and inference remain available. An explicitly configured deployment still requires analytics consent; the Settings toggle cannot invent or configure a SaaS destination.

The console does not automatically monitor ChatGPT or Claude website conversations, inspect all device traffic, read global keystrokes or execute arbitrary agent tools. Explicit capture and routed model requests define its present observation boundary. A provider can retain data after a permitted disclosure according to its own behavior; a local receipt or history deletion does not control that remote copy.

Owner authentication, native IPC or loopback binding, destination policy, memory grants and encryption serve different purposes. None replaces process isolation, which the current runtime explicitly reports as absent. The interface lock does not erase the running core's key or revoke other credentials. Protect the owner session and key, and preserve the independent privacy ledger in any valid restore. Native device-bound keys mean a database copy alone is not a portable backup; see [PLATFORMS.md](PLATFORMS.md).

Implementation references: [administration settings and profiles](../crates/omni-core/src/administration.rs), [HTTP routes and exchange tracking](../crates/omni-core/src/http.rs), [encrypted journal and aggregation](../crates/omni-core/src/journal.rs), [provider console](../apps/desktop/src/Administration.tsx) and [operations console](../apps/desktop/src/Operations.tsx).

## Guided first run

The [first-run guide](GETTING_STARTED.md) introduces the same persistent profiles through Connect → Remember → Continue. Setup performs explicit catalog checks, sets a chosen primary model and optionally saves a confirmed preference. It does not create a grant or send an inference request. Return to the full Models and Settings pages for later administration.

<!-- omni:footer -->
---

**Continue reading** · [Bring your context](CONVERSATION_IMPORT.md) · [Set the rules before sending](POLICIES.md) · [The native workspace](../apps/desktop/README.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
