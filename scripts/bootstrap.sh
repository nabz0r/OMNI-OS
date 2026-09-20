#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Node.js 22.13+ and npm are required. Install the current Node.js LTS from nodejs.org.' >&2
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<13))process.exit(1)' || { echo 'Node.js 22.13+ required.' >&2; exit 1; }
export CARGO_TARGET_DIR="$(node scripts/build-dir.mjs)"
mkdir -p .omni/runtime
chmod 700 .omni .omni/runtime
printf '%s' "$CARGO_TARGET_DIR" > .omni/runtime/build-target
if ! command -v cargo >/dev/null; then
  echo 'Installing the minimal official Rust toolchain…'
  omni_installer=$(mktemp)
  curl --proto '=https' --tlsv1.2 -fsS https://sh.rustup.rs -o "$omni_installer"
  sh "$omni_installer" -y --profile minimal
  rm -f "$omni_installer"
fi
if [[ ! -d node_modules ]]; then npm ci --no-audit --no-fund; fi
cargo build --workspace --locked
