#!/usr/bin/env bash
# Dedicated Linux host/network namespace deployment. Explicit sudo is required.
set -euo pipefail
VPN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OMNI_ROOT="$(cd -- "$VPN_DIR/../.." && pwd)"
if [[ "$(uname -s)" != Linux || $EUID -ne 0 || $# -ne 2 || "$1" != --config ]]; then
  echo 'Usage on a Linux server: sudo infra/vpn/server-up.sh --config /absolute/private/enrollment-directory' >&2
  exit 2
fi
CONFIG_DIR="$(cd -- "$2" && pwd)"
for tool in ip wg nft python3 sysctl flock; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
VPN_BINARY="${OMNI_VPN_BINARY:-${CARGO_TARGET_DIR:-$OMNI_ROOT/target}/release/omni-vpn}"
[[ -x "$VPN_BINARY" && -r "$CONFIG_DIR/server.key" && -r "$CONFIG_DIR/enrollments.json" ]] || { echo 'Build omni-vpn --release and run init-server first.' >&2; exit 1; }
exec 9>/run/omni-vpn-server.lock
flock -n 9 || { echo 'An OMNI VPN server is already running.' >&2; exit 1; }
NS=omni-vpn
if ip netns list | awk '{print $1}' | grep -Fxq "$NS"; then echo 'Namespace omni-vpn already exists; refusing to overwrite it.' >&2; exit 1; fi
if ip link show omni-host >/dev/null 2>&1 || ip link show omni-edge >/dev/null 2>&1; then echo 'A reserved OMNI interface already exists; refusing to overwrite it.' >&2; exit 1; fi
if nft list table ip omni_host >/dev/null 2>&1; then echo 'Firewall table omni_host already exists; refusing to overwrite it.' >&2; exit 1; fi
PREVIOUS_FORWARD="$(sysctl -n net.ipv4.ip_forward)"
CONTROL_PID=''
RELAY_PID=''
HOST_TABLE_CREATED=0
NAMESPACE_CREATED=0
LINK_CREATED=0
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$CONTROL_PID" ]] || kill "$CONTROL_PID" 2>/dev/null || true
  [[ -z "$RELAY_PID" ]] || kill "$RELAY_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  [[ "$HOST_TABLE_CREATED" -eq 0 ]] || nft delete table ip omni_host 2>/dev/null || true
  [[ "$NAMESPACE_CREATED" -eq 0 ]] || ip netns delete "$NS" 2>/dev/null || true
  [[ "$LINK_CREATED" -eq 0 ]] || ip link delete omni-host 2>/dev/null || true
  sysctl -q -w "net.ipv4.ip_forward=$PREVIOUS_FORWARD" >/dev/null
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ip netns add "$NS"
NAMESPACE_CREATED=1
ip link add omni-host type veth peer name omni-edge
LINK_CREATED=1
ip link set omni-edge netns "$NS"
ip address add 10.203.0.1/30 dev omni-host
ip link set omni-host up
ip -n "$NS" address add 10.203.0.2/30 dev omni-edge
ip -n "$NS" link set omni-edge up
ip -n "$NS" link set lo up
ip -n "$NS" route add default via 10.203.0.1
ip -n "$NS" link add omni0 type wireguard
ip netns exec "$NS" wg set omni0 private-key "$CONFIG_DIR/server.key" listen-port 51820
ip -n "$NS" address add 10.77.0.1/16 dev omni0
ip -n "$NS" link set omni0 mtu 1280 up
sysctl -q -w net.ipv4.ip_forward=1 >/dev/null
nft add table ip omni_host
HOST_TABLE_CREATED=1
nft -f - <<'NFT'
add chain ip omni_host prerouting { type nat hook prerouting priority dstnat; policy accept; }
add chain ip omni_host postrouting { type nat hook postrouting priority srcnat; policy accept; }
add chain ip omni_host forward { type filter hook forward priority filter; policy accept; }
add rule ip omni_host prerouting iifname != "omni-host" udp dport { 51820, 51821 } dnat to 10.203.0.2
add rule ip omni_host postrouting ip saddr 10.203.0.0/30 masquerade
add rule ip omni_host forward iifname "omni-host" accept
add rule ip omni_host forward oifname "omni-host" ct state established,related accept
add rule ip omni_host forward oifname "omni-host" udp dport { 51820, 51821 } accept
NFT
ip netns exec "$NS" nft -f - <<'NFT'
add table inet omni_gate
add set inet omni_gate admitted4 { type ipv4_addr; flags timeout; timeout 120s; size 4096; }
add chain inet omni_gate input { type filter hook input priority filter; policy accept; }
add chain inet omni_gate forward { type filter hook forward priority filter; policy drop; }
add rule inet omni_gate input udp dport 51820 ip saddr @admitted4 accept
add rule inet omni_gate input udp dport 51820 drop
add rule inet omni_gate input udp dport 51821 limit rate 30/second burst 60 packets accept
add rule inet omni_gate input udp dport 51821 drop
add rule inet omni_gate input tcp dport 1080 iifname != "omni0" drop
NFT
ip netns exec "$NS" "$VPN_BINARY" knock-server --bind 0.0.0.0:51821 --clients "$CONFIG_DIR/enrollments.json" --state "$CONFIG_DIR/state.json" --interface omni0 &
CONTROL_PID=$!
ip netns exec "$NS" python3 "$VPN_DIR/relay.py" --allow "${OMNI_PROVIDER_DOMAINS:-api.anthropic.com,api.openai.com}" &
RELAY_PID=$!
echo 'OMNI VPN services started. Verify UDP 51820/51821 in the external firewall. Ctrl-C stops this deployment.'
wait -n "$CONTROL_PID" "$RELAY_PID"
