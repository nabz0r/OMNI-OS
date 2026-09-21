#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
omni_installer=''
omni_cleanup_installer() {
  if [[ -n "$omni_installer" ]]; then rm -f -- "$omni_installer"; fi
}
trap omni_cleanup_installer EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Node.js 22.13+ and npm are required. Install the current Node.js LTS from nodejs.org.' >&2
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<13))process.exit(1)' || { echo 'Node.js 22.13+ required.' >&2; exit 1; }
export CARGO_TARGET_DIR="$(node scripts/build-dir.mjs)"
mkdir -p .omni/runtime
chmod 700 .omni .omni/runtime
printf '%s' "$CARGO_TARGET_DIR" > .omni/runtime/build-target
for omni_tool in cc make perl; do
  if ! command -v "$omni_tool" >/dev/null; then
    echo "Required build tool missing: $omni_tool. Install your platform's C/C++ development tools, make and Perl, then retry." >&2
    if [[ "$(uname -s)" = Darwin ]]; then echo 'On macOS: xcode-select --install' >&2; fi
    exit 1
  fi
done
if ! command -v cargo >/dev/null; then
  if ! command -v curl >/dev/null; then
    echo 'curl is required to install Rust. Install curl or the official Rust toolchain, then retry.' >&2
    exit 1
  fi
  echo 'Installing the minimal official Rust toolchain…'
  omni_installer=$(mktemp)
  curl --proto '=https' --tlsv1.2 -fsS https://sh.rustup.rs -o "$omni_installer"
  sh "$omni_installer" -y --profile minimal
  rm -f "$omni_installer"
  omni_installer=''
fi
if ! node scripts/dependency-stamp.mjs check; then
  echo 'Installing JavaScript dependencies from the current lockfile…'
  node scripts/dependency-stamp.mjs invalidate
  if ! npm ci --no-audit --no-fund; then
    echo 'Dependency installation failed. Resolve the npm error above, then re-run ./scripts/bootstrap.sh.' >&2
    exit 1
  fi
  node scripts/dependency-stamp.mjs record
fi
if ! cargo build --workspace --locked; then
  echo 'The local core could not be built. Review the compiler error above; ./run.sh --doctor checks the required tools without changing your installation.' >&2
  exit 1
fi
