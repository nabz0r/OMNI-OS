#!/usr/bin/env bash
# Optional privileged interoperability test. All IP routes/firewalls live in two disposable namespaces.
set -euo pipefail
VPN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OMNI_ROOT="$(cd -- "$VPN_DIR/../.." && pwd)"
[[ "$(uname -s)" == Linux && $EUID -eq 0 ]] || { echo 'This test requires an explicit sudo on Linux.' >&2; exit 2; }
for tool in ip wg nft python3 boringtun-cli ping; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; done
VPN_BINARY="${OMNI_VPN_BINARY:-${CARGO_TARGET_DIR:-$OMNI_ROOT/target}/debug/omni-vpn}"
[[ -x "$VPN_BINARY" ]] || { echo 'Build omni-vpn or set OMNI_VPN_BINARY.' >&2; exit 1; }
TEST_DIR="$(mktemp -d)"
NS_SERVER="omni-test-s-$$"
NS_CLIENT="omni-test-c-$$"
PEER_ONE="omt${$}a"
PEER_TWO="omt${$}b"
WG_ONE="omw${$}a"
WG_TWO="omw${$}b"
SERVER_CREATED=0
CLIENT_CREATED=0
LINK_CREATED=0
PIDS=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  [[ $SERVER_CREATED -eq 0 ]] || ip netns delete "$NS_SERVER" 2>/dev/null || true
  [[ $CLIENT_CREATED -eq 0 ]] || ip netns delete "$NS_CLIENT" 2>/dev/null || true
  [[ $LINK_CREATED -eq 0 ]] || ip link delete "$PEER_ONE" 2>/dev/null || true
  python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$TEST_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
python3 "$VPN_DIR/enroll.py" --endpoint 192.0.2.1 --output "$TEST_DIR/enrollment" --clients 1 --binary "$VPN_BINARY" >/dev/null
CONFIG="$TEST_DIR/enrollment/clients/client-01.json"
python3 - "$CONFIG" "$TEST_DIR" <<'PY'
import json,pathlib,sys
config=json.loads(pathlib.Path(sys.argv[1]).read_text())
directory=pathlib.Path(sys.argv[2])
for field in ('private_key','server_public_key'):
    target=directory/field
    target.write_text(config[field]+'\n')
    target.chmod(0o600)
PY
ip netns add "$NS_SERVER"
SERVER_CREATED=1
ip netns add "$NS_CLIENT"
CLIENT_CREATED=1
ip link add "$PEER_ONE" type veth peer name "$PEER_TWO"
LINK_CREATED=1
ip link set "$PEER_ONE" netns "$NS_SERVER"
ip link set "$PEER_TWO" netns "$NS_CLIENT"
ip -n "$NS_SERVER" address add 192.0.2.1/30 dev "$PEER_ONE"
ip -n "$NS_CLIENT" address add 192.0.2.2/30 dev "$PEER_TWO"
ip -n "$NS_SERVER" link set "$PEER_ONE" up
ip -n "$NS_CLIENT" link set "$PEER_TWO" up
ip -n "$NS_SERVER" link set lo up
ip -n "$NS_CLIENT" link set lo up
ip -n "$NS_SERVER" link add omni0 type wireguard
ip netns exec "$NS_SERVER" wg set omni0 private-key "$TEST_DIR/enrollment/server.key" listen-port 51820
ip -n "$NS_SERVER" address add 10.77.0.1/16 dev omni0
ip -n "$NS_SERVER" link set omni0 up
ip netns exec "$NS_SERVER" nft -f - <<'NFT'
add table inet omni_gate
add set inet omni_gate admitted4 { type ipv4_addr; flags timeout; timeout 120s; }
add chain inet omni_gate input { type filter hook input priority filter; policy accept; }
add rule inet omni_gate input udp dport 51820 ip saddr @admitted4 accept
add rule inet omni_gate input udp dport 51820 drop
NFT
ip netns exec "$NS_SERVER" "$VPN_BINARY" knock-server --bind 0.0.0.0:51821 --clients "$TEST_DIR/enrollment/enrollments.json" --state "$TEST_DIR/enrollment/state.json" --interface omni0 &
PIDS+=("$!")
start_peer() {
  local interface="$1" keyfile="$2" address="$3"
  ip netns exec "$NS_CLIENT" env WG_SUDO=1 boringtun-cli -f "$interface" &
  PIDS+=("$!")
  for _ in {1..50}; do
    if ip -n "$NS_CLIENT" link show "$interface" >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
  ip netns exec "$NS_CLIENT" wg set "$interface" private-key "$keyfile" peer "$(cat "$TEST_DIR/server_public_key")" endpoint 192.0.2.1:51820 allowed-ips 10.77.0.1/32
  ip -n "$NS_CLIENT" address add "$address/32" dev "$interface"
  ip -n "$NS_CLIENT" link set "$interface" mtu 1280 up
}
knock() {
  ip netns exec "$NS_CLIENT" python3 - "$VPN_DIR" "$CONFIG" "$1" <<'PY'
import importlib.util,json,pathlib,subprocess,sys
spec=importlib.util.spec_from_file_location('client',pathlib.Path(sys.argv[1])/'client.py')
client=importlib.util.module_from_spec(spec); spec.loader.exec_module(client)
path=pathlib.Path(sys.argv[2]); config=json.loads(path.read_text()); action=sys.argv[3]
if action=='prepare_rotation':
    private=subprocess.check_output(['wg','genkey'],text=True).strip()
    public=subprocess.check_output(['wg','pubkey'],input=private+'\n',text=True).strip()
    config['pending']=dict(epoch=1,private_key=private,public_key=public)
    client.persist(path,config)
    target=path.parent/'next.key';target.write_text(private+'\n');target.chmod(0o600)
if action=='bad_secret':
    config['knock_secret']='AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
    action='open'
if action=='open': client.control(config,action,0)
else: client.control(config,action,1,config['pending']['public_key'])
PY
}
start_peer "$WG_ONE" "$TEST_DIR/private_key" 10.77.1.2
ip -n "$NS_CLIENT" route add 10.77.0.1/32 dev "$WG_ONE"
if ip netns exec "$NS_CLIENT" ping -q -c 1 -W 1 10.77.0.1 >/dev/null; then echo 'Unadmitted peer was accepted' >&2; exit 1; fi
if knock bad_secret 2>/dev/null; then echo 'Wrong secret was accepted' >&2; exit 1; fi
knock open
ip netns exec "$NS_CLIENT" ping -q -c 2 -W 6 10.77.0.1 >/dev/null
knock prepare_rotation
start_peer "$WG_TWO" "$TEST_DIR/enrollment/clients/next.key" 10.77.1.3
ip -n "$NS_CLIENT" route replace 10.77.0.1/32 dev "$WG_TWO"
ip netns exec "$NS_CLIENT" ping -q -c 2 -W 6 10.77.0.1 >/dev/null
knock commit_rotation
ip -n "$NS_CLIENT" route replace 10.77.0.1/32 dev "$WG_ONE"
ip netns exec "$NS_CLIENT" ping -q -c 1 -W 2 10.77.0.1 >/dev/null
sleep 32
if ip netns exec "$NS_CLIENT" ping -q -c 1 -W 2 10.77.0.1 >/dev/null; then echo 'Retired key survived overlap expiry' >&2; exit 1; fi
ip -n "$NS_CLIENT" route replace 10.77.0.1/32 dev "$WG_TWO"
ip netns exec "$NS_CLIENT" ping -q -c 1 -W 2 10.77.0.1 >/dev/null
echo '{"passed":true,"test":"boringtun-to-linux-wireguard","admission":true,"rotation":true,"expired_key_rejected":true}'
