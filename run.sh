#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"
omni_mode=native
omni_simulation=0
for omni_arg in "$@"; do
  case "$omni_arg" in --web) omni_mode=web;; --simulate) omni_simulation=1;; --help) echo './run.sh [--web] [--simulate]'; exit 0;; *) echo "Unknown argument: $omni_arg" >&2; exit 1;; esac
done
./scripts/bootstrap.sh
export CARGO_TARGET_DIR="$(node scripts/build-dir.mjs)"
mkdir -p .omni/runtime
chmod 700 .omni .omni/runtime
export OMNI_DATA_DIR="${OMNI_DATA_DIR:-$PWD/.omni/vault}"
export OMNI_COLLECTOR_DB="${OMNI_COLLECTOR_DB:-$PWD/.omni/collector.sqlite}"
export OMNI_SIMULATION_REPORT="$PWD/.omni/simulation-latest.json"
export OMNI_LOCAL_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export OMNI_AGENT_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
umask 077
printf '%s' "$OMNI_LOCAL_TOKEN" > .omni/runtime/admin-token
printf '%s' "$OMNI_AGENT_TOKEN" > .omni/runtime/agent-token
export OMNI_LLM_BASE="${OMNI_LLM_BASE:-http://127.0.0.1:11434/v1}"
export OMNI_LLM_MODEL="${OMNI_LLM_MODEL:-qwen3:0.6b}"
omni_pids=()
cleanup() { for omni_pid in "${omni_pids[@]}"; do kill "$omni_pid" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM
if [[ "$omni_simulation" = 1 ]]; then
  export OMNI_SIMULATION=1 OMNI_MIN_REPORTS=2 OMNI_ANALYTICS_OPT_IN=true
  export OMNI_DATA_DIR="$PWD/.omni/simulation-viewer"
  export OMNI_COLLECTOR_DB="$PWD/.omni/simulation-collector.sqlite"
  export OMNI_LLM_BASE=http://127.0.0.1:4101/v1
  node scripts/mock-providers.mjs > .omni/runtime/providers.log 2>&1 & omni_pids+=("$!")
fi
"$CARGO_TARGET_DIR/debug/omni-core" > .omni/runtime/core.log 2>&1 & omni_pids+=("$!")
node services/collector/src/server.mjs > .omni/runtime/collector.log 2>&1 & omni_pids+=("$!")
npm run dev --workspace @omni/desktop -- --host 127.0.0.1 > .omni/runtime/desktop.log 2>&1 & omni_pids+=("$!")
node scripts/wait-ready.mjs http://127.0.0.1:3007/health http://127.0.0.1:3008/health http://127.0.0.1:3006
echo 'OMNI ready: http://localhost:3006'
echo 'Local console token: .omni/runtime/admin-token (never share or commit it).'
if [[ "$omni_simulation" = 1 ]]; then
  OMNI_SIM_USE_EXISTING=1 node scripts/simulate.mjs
fi
if [[ "$omni_mode" = native ]]; then
  cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml
else
  echo 'Press Ctrl+C to stop the services started by this session.'
  wait "${omni_pids[0]}"
fi
