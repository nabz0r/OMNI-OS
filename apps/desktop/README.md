# OMNI Nebula

A local interface built with React, Three.js and an optional Tauri 2 desktop shell. It makes saved memories, sharing permissions and disclosure receipts inspectable without treating a model's interpretation as a fact.

## Start the interface

Run the repository's `run.sh` first to start the authenticated core and collector. `npm run dev --workspace @omni/desktop` starts the development server at `http://127.0.0.1:3006`; `npm run build --workspace @omni/desktop` checks types and builds the bundle.

For the native shell, run `npm run tauri --workspace @omni/desktop -- dev` with the core already running. If Vite is already running on port 3006, use `npm run tauri --workspace @omni/desktop -- dev --no-dev-server-wait --config '{"build":{"beforeDevCommand":""}}'`. The native global shortcut is **Alt + Shift + Space**. Within either interface, **Command/Ctrl + K** opens the request launcher. The Tauri crate is independent of the core Cargo workspace.

The session token is held in `sessionStorage` and attached as a Bearer header to loopback API requests. An explicit `?token=` startup parameter is consumed and removed from the current browser-history entry; prefer entering the token manually. In native mode, the restricted `local_session_token` command reads only `OMNI_LOCAL_TOKEN` from the launcher process environment and supplies it to the main webview. It does not read arbitrary files. Tauri exposes no filesystem, shell, clipboard or HTTP plugin commands to the frontend.

**Lock session** clears the token, conversation and drafts from the interface and aborts its pending requests. The same running interface does not immediately provision the native token again after an explicit lock. This action locks the interface session; it does not stop the core or revoke credentials held by other clients.

## Inspect and curate memory

Nebula loads asynchronously when the overview needs it. While the overview remains mounted, state refreshes update the existing scene without recreating its WebGL renderer. Memory points use distinct status colors and local halos on a dark background. The center represents the vault; lines indicate vault membership, not inferred semantic relationships. Positions are a visual arrangement, not a measure of similarity or importance.

Click a point to open its memory, or focus the scene and use the arrow keys to browse, **Enter** to open, and **+ / −** to zoom. Drag to explore. The page retains normal wheel scrolling and vertical touch scrolling. The scene adapts to its container and leaves editing available in the memory list.

Automatic rotation is limited to 30 fps and stops after interaction. Rendering pauses when the scene is offscreen or the document is hidden. Reduced-motion preferences and **Low energy mode** use rendering on demand; low-energy mode also lowers pixel density. If WebGL is unavailable, an explanatory fallback leaves the list usable.

Use **Add memory** for a fact you choose to confirm yourself. Use **Memory → Import text** to save a note or conversation as a local source and request reviewable proposals from the local extraction model. Imported text is limited to 100,000 UTF-8 bytes. Extraction examines up to the first 12,000 characters and can produce at most five proposals. If extraction is unavailable or invalid, the core retains the source and proposes an excerpt for review. Imported proposals are never automatically confirmed or authorized for sharing.

The list supports text search and status filters. Open a memory to correct its content or change its status. **Delete** first asks for confirmation; **Keep memory** cancels that choice. Confirming deletion removes the memory and its revision history from this vault. A shared source remains while other memories depend on it. Copies already disclosed cannot be recalled.

A permission names an exact destination, selected confirmed memories and an expiry. Revocation prevents future disclosures under that permission. Demonstration data is explicitly labeled synthetic.

## Continue a conversation deliberately

The launcher sends your message to the configured model endpoint. Selecting a permission allows the core to add its authorized memory context. **No memory context** disables that augmentation; it does not prevent your own messages or the conversation's included turns from reaching the model.

For each follow-up, the interface includes up to ten previous complete user/assistant exchanges. The new message and included history together may contain at most 100,000 UTF-8 bytes of conversation text. Older exchanges are omitted as necessary; this limit does not include JSON overhead or separately bounded vault context. The visible conversation is held in interface memory, not automatically saved as permanent memories. Closing the launcher preserves it during the session; reloading the interface or locking the session clears it.

Changing the selected permission starts a new conversation. A detected provider or model change, permission expiry or revocation, or a change to memories covered by the selected permission also clears the conversation and stops waiting for its pending reply. Memory edits, deletions and grant revocations made through the interface invalidate the conversation immediately after the mutation succeeds. **New conversation** clears its turns and draft on demand. These resets prevent the interface from deliberately continuing with known obsolete context; they cannot recall anything already received by a provider.

Responses render as Markdown with tables and code blocks. Raw HTML is omitted, and image markup becomes a text description instead of loading an image. Links require a user action and open with `noopener noreferrer`. **Copy response** copies the original response text to the clipboard; if the browser denies clipboard access, the interface asks you to select the text manually.

A failed request restores the message for manual retry unless you have already entered a different draft. Empty responses are treated as errors instead of entering the conversation history. **Stop waiting** cancels the interface's wait; it does not establish that the provider stopped processing or never received the request. A retry is another request. Check **Activity** before retrying an uncertain delivery. Receipts distinguish sent context, authorization and failed or possibly partial delivery.

The interface displays core and collector data without inventing global percentages. An installation report is not a count of unique people. A disconnected core leaves the last loaded state visible with an offline notice; collector snapshots identify when live updates are interrupted.

## Browser verification

Run `npx playwright install chromium` installs the browser once. `npm run test:ui` against the isolated local `--simulate` stack. It uses Playwright and reads `.omni/runtime/admin-token` without printing it. Its mutation flow requires the core to identify itself as a simulation. Generated screenshots live in ignored `apps/desktop/artifacts/`.

The expanded flow is designed to check:

- Memory creation and editing, a scoped permission, a contextual request and its receipt.
- Follow-up history in the outgoing request, draft recovery after a failed request, and Markdown rendering without executable HTML or remote images.
- Conversation reset after an authorized memory changes, followed by permission revocation.
- Text import as unconfirmed proposals, the two-step deletion flow and cancellation of deletion.
- Every main view, mobile overflow at 430 px, and an empty conversation and draft after locking and unlocking.

Some failure and rendering cases use explicit browser response fixtures; ordinary contextual exchanges go to the configured local simulation provider. These checks are a verification procedure, not a statement that the current run has passed. Recorded results belong in [validation evidence](../../docs/VALIDATION.md).

Use `OMNI_QA_VIEW_ONLY=1` for read-only screenshots. `OMNI_PLAYWRIGHT_MODULE` and `OMNI_QA_CHROMIUM` can point to a bundled Playwright package and Chromium executable. Additional manual checks should cover keyboard selection, reduced motion, offscreen rendering, **Copy response**, **Stop waiting**, provider changes and wildcard permissions.

Application gateway, MCP and browser-extension integration details are in [INTEGRATIONS.md](../../docs/INTEGRATIONS.md).
