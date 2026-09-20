#!/usr/bin/env bash
set -euo pipefail
OMNI_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${CARGO_TARGET_DIR:-}" && -r "$OMNI_ROOT/.omni/runtime/build-target" ]]; then
  CARGO_TARGET_DIR="$(cat "$OMNI_ROOT/.omni/runtime/build-target")"
  export CARGO_TARGET_DIR
fi
mode="${1:-status}"
if [[ $# -gt 0 ]]; then shift; fi
case "$mode" in
  status)
    if [[ -n "${OMNI_VPN_CONFIG:-}" && -r "${OMNI_VPN_CONFIG}" ]]; then
      echo '{"state":"configured_not_verified","note":"A configuration is not proof of a live tunnel. Start client explicitly."}'
    else
      echo '{"state":"not_configured","connected":false,"note":"Import a real peer configuration to start WireGuard."}'
    fi
    ;;
  client) exec "$OMNI_ROOT/infra/vpn/client.sh" "$@" ;;
  server) exec "$OMNI_ROOT/infra/vpn/server-up.sh" "$@" ;;
  init-server) exec python3 "$OMNI_ROOT/infra/vpn/enroll.py" --binary "${OMNI_VPN_BINARY:-${CARGO_TARGET_DIR:-$OMNI_ROOT/target}/release/omni-vpn}" "$@" ;;
  simulate)
    cd "$OMNI_ROOT"
    exec "${CARGO:-$HOME/.cargo/bin/cargo}" run -p omni-vpn -- simulate "$@"
    ;;
  *) echo 'Usage: ./start_network.sh {status|client --config PATH|init-server --endpoint IP --output DIR|server --config DIR|simulate [OPTIONS]}' >&2; exit 2 ;;
esac
