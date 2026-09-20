# OMNI Nebula

English-first local interface built with React, Three.js and an optional Tauri 2 desktop shell. Run the repository's `run.sh` first to start the authenticated core and collector. `npm run dev --workspace @omni/desktop` opens the development server on `http://127.0.0.1:3006`; `npm run build --workspace @omni/desktop` validates types and builds the bundle.

For the native shell, run `npm run tauri --workspace @omni/desktop -- dev` with the core already running. If Vite is already running on 3006, use `npm run tauri --workspace @omni/desktop -- dev --no-dev-server-wait --config '{"build":{"beforeDevCommand":""}}'`. The native global shortcut is **Alt + Shift + Space**. Within either UI, **Command/Ctrl + K** opens the request launcher. The Tauri crate is intentionally independent of the core Cargo workspace.

The session token is held in `sessionStorage` and attached as a Bearer header to loopback API requests. Locking the session clears it. An explicit `?token=` startup parameter is consumed immediately and removed from browser history; prefer entering the token manually. In native mode the restricted `local_session_token` command reads only `OMNI_LOCAL_TOKEN` from the launcher process environment and supplies it to the main webview. It does not read arbitrary files. Tauri exposes no filesystem, shell, clipboard or HTTP plugin commands to the frontend.

Each graph node corresponds to a stored memory; connections indicate vault membership, not inferred semantic relationships. Background particles are decorative. Rendering stops while hidden, respects reduced motion, runs at at most 30 fps, and can switch to render-on-demand with Low energy mode. Unsupported WebGL falls back to a message; memories remain accessible in the list.

The app displays data returned by the core and collector. It never fabricates aggregate percentages. Simulation state is labeled. A collector report is an installation report, not a count of unique people. Browser captures are managed by the separate explicit-capture extension.

`node apps/desktop/qa.mjs` runs the real browser smoke flow against a running local development stack, using Playwright and the session token in `.omni/runtime/admin-token` without printing it. It creates and removes an explicitly synthetic test memory, issues then revokes one permission, sends one request, checks the receipt, and captures every view plus a 430 px mobile layout. Use `OMNI_QA_VIEW_ONLY=1` for read-only screenshots. `OMNI_PLAYWRIGHT_MODULE` and `OMNI_QA_CHROMIUM` can point to a bundled Playwright package and Chromium executable. Generated screenshots live in ignored `artifacts/`.

## En français

La mémoire reste locale et modifiable. Une autorisation désigne une destination exacte, des souvenirs précis et une durée. La révocation empêche les futurs partages via OMNI, mais ne rappelle pas les copies déjà transmises. Le moteur de conversation n'utilise aucune mémoire sans autorisation sélectionnée. Les données de démonstration sont signalées comme synthétiques.
