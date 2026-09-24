# OMNI Nebula

A shared interface built with React, Three.js and Tauri 2 for desktop and mobile targets. Native applications embed the Rust engine and use platform key stores; the historical `apps/desktop` directory name does not limit the source to desktop. The interface makes saved memories, sharing permissions and disclosure receipts inspectable without treating a model's interpretation as a fact.

## Start the interface

Standalone native startup initializes the embedded Rust core in the application process, with its own OS application-data vault and authenticated IPC. It starts no HTTP listener, Node.js collector or Vite server by default. See [Platforms](../../docs/PLATFORMS.md) for native build targets, prerequisites and limits, and [Validation](../../docs/VALIDATION.md) for actual package/device results.

For native source development, run `npm run tauri --workspace @omni/desktop -- dev` with the platform prerequisites installed. The Tauri app embeds the core unless explicitly placed in external development mode. For the separate browser/demo stack, use repository `run.sh`; its native-window mode sets `OMNI_EXTERNAL_CORE=1` to connect to its external core and collector instead. `npm run dev --workspace @omni/desktop` starts only Vite at `http://127.0.0.1:3006`, and `npm run build --workspace @omni/desktop` checks types and builds the UI bundle. Neither command alone starts the browser's external API services.

The desktop global shortcut is **Alt + Shift + Space** when the OS permits registration. Within the interface, **Command/Ctrl + K** opens the request launcher; mobile also offers touch controls. No mobile global shortcut, background capture service or system-wide VPN is installed.

Normal browser startup receives a one-time `#connect=` fragment. The UI removes it synchronously and exchanges it at `/api/session/claim`; the generated link never contains the owner bearer token. React effect replay shares the same pending exchange. An existing browser credential cannot override a new pairing attempt. Expired or consumed links fall back to manual unlock.

The session token is held in `sessionStorage`. Browser development requests attach it as a bearer header to the loopback API. Native `native_session` initializes the embedded runtime and provisions its owner token; `core_request` validates the main window and token before dispatching to the same router. Legacy `?token=` parameters are removed and discarded rather than adopted as a session. The database key never enters the webview. The device plugin rejects frontend calls to native key operations, and the frontend has no general-purpose filesystem or shell command.

**Lock session** clears the token, conversation and drafts from the interface and stops pending waits. It does not immediately provision another token after an explicit lock. Native **Unlock on this device** deliberately reopens the session; browser development retains manual token entry. This is an interface lock, not biometric or OS authentication. It does not stop the core, destroy its key, revoke another client's credentials or prove cancellation of a dispatched provider request.

## A guided first run

Fresh unused personal vaults open **Guided setup** unless the browser has dismissed it. **Overview → Guided setup** remains available later. Connect an existing or new provider, check its catalog, explicitly select a model, optionally save a confirmed preference, then open a fresh conversation. No grant or inference request is created by setup. The overview offers the next useful action according to the latest known primary-provider discovery state. This state includes its check timestamp, not a claim of continuous service health.

Starter suggestions fill the composer without sending. A rendering boundary offers **Reload OMNI** if the interface fails to load, without deleting saved vault objects. See [Getting started](../../docs/GETTING_STARTED.md).

## Inspect and curate memory

Nebula loads asynchronously when the overview needs it. While the overview remains mounted, state refreshes update the existing scene without recreating its WebGL renderer. Memory points use distinct status colors and local halos on a dark background. The center represents the vault; lines indicate vault membership, not inferred semantic relationships. Positions are a visual arrangement, not a measure of similarity or importance.

Click a point to open its memory, or focus the scene and use the arrow keys to browse, **Enter** to open, and **+ / −** to zoom. Drag to explore. The page retains normal wheel scrolling and vertical touch scrolling. The scene adapts to its container and leaves editing available in the memory list.

Automatic rotation is limited to 30 fps and stops after interaction. Rendering pauses when the scene is offscreen or the document is hidden. Reduced-motion preferences and **Low energy mode** use rendering on demand; low-energy mode also lowers pixel density. If WebGL is unavailable, an explanatory fallback leaves the list usable.

Use **Add memory** for a fact you choose to confirm yourself. Use **Memory → Import text** to save a note or conversation as a local source and request reviewable proposals from the local extraction model. Imported text is limited to 100,000 UTF-8 bytes. Extraction examines up to the first 12,000 characters and can produce at most five proposals. If extraction is unavailable or invalid, the core retains the source and proposes an excerpt for review. Imported proposals are never automatically confirmed or authorized for sharing.

The list supports text search and status filters. Open a memory to correct its content or change its status. **Delete** first asks for confirmation; **Keep memory** cancels that choice. Confirming deletion removes the memory and its revision history from this vault. A shared source remains while other memories depend on it. Copies already disclosed cannot be recalled.

A permission names an exact destination, selected confirmed memories and an expiry. Revocation prevents future disclosures under that permission. Demonstration data is explicitly labeled synthetic.

## Continue a conversation deliberately

The launcher sends your message to the selected provider and model. **Models** manages persistent connections; the launcher selectors choose the connection for this conversation. Changing either starts a new conversation. OpenAI-compatible and Anthropic replies are normalized for the same interface. Selecting a permission allows the core to add its authorized memory context. **No memory context** disables that augmentation; it does not prevent your own messages or the conversation's included turns from reaching the model.

For each follow-up, the interface includes up to ten previous complete user/assistant exchanges. The new message and included history together may contain at most 100,000 UTF-8 bytes of conversation text. Older exchanges are omitted as necessary; this limit does not include JSON overhead or separately bounded vault context. The visible conversation is held in interface memory, not automatically saved as permanent memories. Closing the launcher preserves it during the session; reloading the interface or locking the session clears it.

Changing the selected permission starts a new conversation. A detected provider or model change, permission expiry or revocation, or a change to memories covered by the selected permission also clears the conversation and stops waiting for its pending reply. Memory edits, deletions and grant revocations made through the interface invalidate the conversation immediately after the mutation succeeds. **New conversation** clears its turns and draft on demand. These resets prevent the interface from deliberately continuing with known obsolete context; they cannot recall anything already received by a provider.

Responses render as Markdown with tables and code blocks. Raw HTML is omitted, and image markup becomes a text description instead of loading an image. Links require a user action and open with `noopener noreferrer`. **Copy response** copies the original response text to the clipboard; if the browser denies clipboard access, the interface asks you to select the text manually.

A failed request restores the message for manual retry unless you have already entered a different draft. Empty responses are treated as errors instead of entering the conversation history. **Stop waiting** cancels the interface's wait; it does not establish that the provider stopped processing or never received the request. A retry is another request. Check **History → Requests** and **Disclosure receipts** before retrying an uncertain delivery. Receipts distinguish sent context, authorization and failed or possibly partial delivery.

The interface displays core and configured collector data without inventing global percentages. Standalone native bootstrap has no collector; Collective remains unconnected and analytics cannot be enabled or prepared. An installation report is not a count of unique people. A disconnected external core leaves the last loaded state visible with an offline notice; configured collector snapshots identify when live updates are interrupted.

## Administer the installation

The console adds **Policies**, **Models**, **History**, **Usage**, **Logs** and **Settings** alongside memory and permission controls. Provider profiles and local settings survive restarts in SQLCipher. Keys are entered through a password field, written to the local core and never returned by the API. Changing a provider URL clears its stored key unless an explicit replacement accompanies the change.

Use **Check connection** to read a provider catalog. For Ollama, the result also lists models reported loaded at the time of the check; cloud model catalogs do not expose running instances. Discovery does not download or load a model. The launcher shows enabled, policy-permitted profiles and their model choices.

**History → Requests** offers filters, pages and a request detail dialog. **Disclosure receipts** remains a separate record of memory authorization and delivery. The request journal stores metadata only; the conversation itself is still transient interface state. **Usage** separates provider token reports, measured JSON/SSE body sizes, source-versus-context estimates and optional manually priced costs. **Logs** presents structured audit events such as profile edits, grants and history clearing, not raw operating-system log files. The current filtered metadata page can be exported as JSON or CSV.

Browser exports use downloads. Native desktop saves under `Documents/OMNI`; mobile opens the system share sheet without selecting a recipient or claiming that a cancelled sheet saved anything. The native export operation restricts names, formats and payload size; it does not expose arbitrary filesystem writes. These metadata files are outside SQLCipher encryption and are not vault backups.

**Settings** controls whether new requests are journaled, retention from 1 to 365 days, the local-only extractor, analytics consent and low-energy rendering. Clearing request history requires confirmation and preserves memories, permissions, receipts, audit events and the DP budget. Network policy and key custody are installation details that require a service restart to change. Exporting configuration excludes secrets and discovery state.

The [administration guide](../../docs/ADMINISTRATION.md) documents every field, endpoint, metric and boundary. Native dialogs support keyboard dismissal and prevent the launcher shortcut from opening another modal behind them.

## Request policies and attachments

**Policies** provides the local rule chain, allowed text types, volume limits, a tester for the saved revision and a private decision trail. A deployment-provisioned baseline is shown read-only. All enforcement runs in Rust, including native IPC; the interface does not decide whether a request can bypass a rule. [Policy behavior and enterprise boundary](../../docs/POLICIES.md).

The launcher accepts TXT, MD, CSV, JSON, LOG, YAML and YML as UTF-8 text, within both policy layers. Files remain transient, travel as quoted text and are rechecked on follow-ups. Changing destinations or clearing/locking the conversation clears them. Native binary uploads, opaque provider file references and response filtering are not implemented.

## Browser verification

Install the browser once with `npx playwright install chromium`. Run `npm run test:ui` and `npm run test:console` against the isolated local `--simulate --no-open` stack. They use Playwright and read `.omni/runtime/admin-token` without printing it. Their mutation flows require the core to identify itself as a simulation. Then run `npm run test:onboarding` and `npm run test:setup`: these launch separate temporary cores and encrypted vaults against loopback fixture providers, using the same UI server. They cover one-time browser pairing, guided setup, first conversation, profile creation and recovery from authentication or catalog failures. Generated screenshots live in ignored `apps/desktop/artifacts/`.

Run `npm run test:native` as the fifth suite, with the core built and the UI server still available. It supplies a mocked Tauri invocation bridge for iOS/Android frontend behavior, while all API results come from a real isolated Rust core and encrypted temporary vault. It checks that requests use the bridge rather than browser API fetches, exercises setup and deliberate unlocking, and checks metadata export calls for private-content leaks. Export presentation is mocked. This browser suite does not exercise real Tauri IPC, OS credential stores, a native share sheet, packaged binaries or phone hardware; those checks need independent evidence.

The expanded flow is designed to check:

- Memory creation and editing, a scoped permission, a contextual request and its receipt.
- Follow-up history in the outgoing request, draft recovery after a failed request, and Markdown rendering without executable HTML or remote images.
- Conversation reset after an authorized memory changes, followed by permission revocation.
- Text import as unconfirmed proposals, the two-step deletion flow and cancellation of deletion.
- Provider creation/discovery/edit/deletion, default selection, launcher routing, history details, usage and logs, metadata exports, retention settings and secret exclusion.
- Every main view, mobile overflow at 430 px, and an empty conversation and draft after locking and unlocking.

Some failure and rendering cases use explicit browser response fixtures; ordinary contextual exchanges go to the configured local simulation provider. These checks are a verification procedure, not a statement that the current run has passed. Recorded results belong in [validation evidence](../../docs/VALIDATION.md).

Use `OMNI_QA_VIEW_ONLY=1` for read-only screenshots. `OMNI_PLAYWRIGHT_MODULE` and `OMNI_QA_CHROMIUM` can point to a bundled Playwright package and Chromium executable. Additional manual checks should cover keyboard selection, reduced motion, offscreen rendering, **Copy response**, **Stop waiting**, provider changes and wildcard permissions.

Application gateway, MCP and browser-extension integration details are in [INTEGRATIONS.md](../../docs/INTEGRATIONS.md).

Run `npm run test:policies` as the sixth suite. It uses a real isolated core and synthetic provider to verify regex editing, saved-policy previews, file controls, blocked egress, successful attachment delivery, follow-up revalidation and mobile layout.
