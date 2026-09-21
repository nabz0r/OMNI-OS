#!/usr/bin/env bash
set -euo pipefail
set +x
cd "$(dirname "$0")"
export PATH="$HOME/.cargo/bin:$PATH"
omni_mode=native
omni_simulation=0
omni_open=1
omni_doctor=0
for omni_arg in "$@"; do
  case "$omni_arg" in
    --web) omni_mode=web;;
    --simulate) omni_simulation=1;;
    --no-open) omni_open=0;;
    --doctor) omni_doctor=1;;
    --help) echo './run.sh [--web] [--simulate] [--no-open] [--doctor]'; exit 0;;
    *) echo "Unknown argument: $omni_arg" >&2; exit 1;;
  esac
done
if [[ "$omni_doctor" = 1 ]]; then
  if ! command -v node >/dev/null; then
    echo 'Node.js 22.13+ is required for the read-only diagnostic. Install Node.js and npm, then retry.' >&2
    exit 1
  fi
  if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<13))process.exit(1)'; then
    echo 'Node.js 22.13+ is required for the read-only diagnostic. Upgrade Node.js, then retry.' >&2
    exit 1
  fi
  if [[ "$omni_simulation" = 1 ]]; then exec node scripts/doctor.mjs --simulate; fi
  exec node scripts/doctor.mjs
fi
# Pairing is generated for this launch only, never reused from the environment.
unset OMNI_PAIRING_SECRET
omni_ports=(3006 3007 3008)
if [[ "$omni_simulation" = 1 ]]; then omni_ports+=(4101 4102); fi
if command -v node >/dev/null; then node scripts/check-ports.mjs "${omni_ports[@]}"; fi
./scripts/bootstrap.sh
export CARGO_TARGET_DIR="$(node scripts/build-dir.mjs)"
node scripts/check-ports.mjs "${omni_ports[@]}"
export OMNI_CORE_PORT=3007 OMNI_COLLECTOR_PORT=3008 OMNI_COLLECTOR_HOST=127.0.0.1
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
source scripts/lifecycle.sh
trap omni_stop_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ "$omni_simulation" = 1 ]]; then
  unset REDIS_URL OMNI_UPSTREAM_ALLOWLIST OMNI_SOCKS_PROXY
  export NODE_ENV=development OMNI_VPN_REQUIRED=false
  export OMNI_LLM_API_KEY='' OPENAI_API_KEY='' ANTHROPIC_API_KEY=''
  export OMNI_SIMULATION=1 OMNI_MIN_REPORTS=2 OMNI_ANALYTICS_OPT_IN=true
  # Keep synthetic data and its development key separate from any Keychain-backed vault.
  # Never switch the encryption backend of an existing personal or simulation vault.
  export OMNI_KEY_STORAGE=file
  export OMNI_DATA_DIR="$PWD/.omni/simulation-viewer-file-v1"
  export OMNI_COLLECTOR_DB="$PWD/.omni/simulation-collector.sqlite"
  export OMNI_LLM_BASE=http://127.0.0.1:4101/v1
  export OMNI_LLM_MODEL=omni-synthetic
  export OMNI_ANTHROPIC_BASE=http://127.0.0.1:4102/v1
  export OMNI_ANALYTICS_URL=http://127.0.0.1:3008/api/v1/analytics
  omni_start_service 'Synthetic providers' .omni/runtime/providers.log node scripts/mock-providers.mjs
fi
omni_pairing_secret=''
if [[ "$omni_mode" = web && "$omni_open" = 1 ]]; then
  omni_pairing_secret="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  OMNI_PAIRING_SECRET="$omni_pairing_secret" omni_start_service 'OMNI core' .omni/runtime/core.log "$CARGO_TARGET_DIR/debug/omni-core"
else
  omni_start_service 'OMNI core' .omni/runtime/core.log "$CARGO_TARGET_DIR/debug/omni-core"
fi
omni_start_service 'Analytics collector' .omni/runtime/collector.log node services/collector/src/server.mjs
omni_start_service 'Desktop interface' .omni/runtime/desktop.log npm run dev --workspace @omni/desktop -- --host 127.0.0.1
OMNI_SERVICE_PIDS="${omni_pids[*]}" node scripts/wait-ready.mjs http://127.0.0.1:3007/health http://127.0.0.1:3008/health http://127.0.0.1:3006
omni_check_services
echo 'OMNI ready: http://localhost:3006'
echo 'Local console token: .omni/runtime/admin-token (never share or commit it).'
if [[ -n "$omni_pairing_secret" ]]; then
  echo 'Opening your local console with a one-time connection…'
  printf '%s' "$omni_pairing_secret" | node scripts/open-browser.mjs http://localhost:3006 || true
fi
unset omni_pairing_secret
if [[ "$omni_simulation" = 1 ]]; then
  OMNI_SIM_USE_EXISTING=1 node scripts/simulate.mjs
fi
if [[ "$omni_mode" = native && "$omni_open" = 1 ]]; then
  cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml &
  omni_native_pid=$!
  while kill -0 "$omni_native_pid" 2>/dev/null; do
    omni_check_services
    sleep 0.5
  done
  wait "$omni_native_pid"
else
  echo 'Press Ctrl+C to stop the services started by this session.'
  while omni_check_services; do sleep 0.5; done
  exit 1
fi
