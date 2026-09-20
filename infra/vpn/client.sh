#!/usr/bin/env bash
set -euo pipefail
VPN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -ne 2 || "$1" != "--config" ]]; then
  echo 'Usage: sudo infra/vpn/client.sh --config /absolute/path/client.json' >&2
  exit 2
fi
exec python3 "$VPN_DIR/client.py" "$@"
