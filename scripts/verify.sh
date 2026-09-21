#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="$(node scripts/build-dir.mjs)"
export OMNI_VPN_BINARY="$CARGO_TARGET_DIR/debug/omni-vpn"
cargo fmt --all -- --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --workspace --locked
npm test
node --test scripts/lifecycle.test.mjs
npm run build
python3 infra/vpn/test_scripts.py
bash -n run.sh start_network.sh scripts/bootstrap.sh scripts/lifecycle.sh infra/vpn/client.sh infra/vpn/server-up.sh
npm run simulate
