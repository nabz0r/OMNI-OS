# VPN transport, admission and rotation

The VPN is an optional transport for the local gateway. It does not read HTTPS, decrypt applications, install a certificate authority, or intercept every AI application. Understanding and permission checks belong to the local gateway. An unconfigured installation remains usable locally and reports `not_configured`; it never invents a connected peer.

```text
Application / agent → local OMNI gateway → provider TLS session
                                          │
                          SOCKS5 to 10.77.0.1:1080
                                          │
                          macOS utun / boringtun userspace
                                          │ encrypted WireGuard UDP
                          Linux kernel WireGuard in network namespace
                                          │
                          private SOCKS relay → approved provider:443

Separate control: HMAC admission/rotation UDP → Linux admission service
Separate analytics: local DP reports → configured analytics collector
```

Only the private relay address receives a host route. Public AI/CDN addresses and unrelated applications are not rerouted. The SOCKS relay permits exact configured provider domains on TCP 443, rejects private DNS answers and resolves to a validated numeric address. It forwards TLS bytes without terminating TLS. The provider necessarily receives the requests explicitly authorized for that provider; the relay can observe network addresses, timing and volume. This is not anonymity against the hub operator or a promise of absolute privacy.

## Run without changing the network

```sh
./start_network.sh status
./start_network.sh simulate --clients 6 --rounds 3 --output .omni/reports/vpn.json
```

The simulator uses actual localhost UDP sockets and `boringtun::noise::Tunn` (pinned to 0.7.1), including real Noise handshakes and encrypted IPv4/UDP packets. No root access or tunnel device is required. It supports 6–32 clients and 2–20 rounds. It verifies forged/replayed knocks, authenticated fresh-key rotation, overlapping keys, old-key rejection, expired admission, modified ciphertext and replayed ciphertext. Rotation policy time is accelerated; cryptographic WireGuard timers remain real. Reports contain synthetic activity metadata and explicit assertions, never prompt/response text.

`npm run simulate` also starts isolated fake local/SaaS providers and passes their loopback origins using `--provider-urls`. In that **simulation only**, the hub consumes the synthetic task and calls a fake provider; the encrypted response returns to its client. Only literal loopback HTTP origins are accepted. This does not describe production TLS handling or constitute a benchmark of real providers.

## Deploy a Linux server

Use a dedicated Linux host with WireGuard kernel support, Bash 4.3+, `iproute2`, `wireguard-tools`, `nftables`, `python3` and `util-linux`. The server is intentionally started with explicit administrative privileges. Build on that Linux host:

```sh
cargo build -p omni-vpn --release --locked
export OMNI_PUBLIC_IPV4="${OMNI_PUBLIC_IPV4:?Set this to the IPv4 address actually assigned to this server}"
./start_network.sh init-server --endpoint "$OMNI_PUBLIC_IPV4" --output "$PWD/.omni/vpn-enrollment" --clients 6
sudo ./start_network.sh server --config "$PWD/.omni/vpn-enrollment"
```

`OMNI_VPN_BINARY` can select an existing executable. `start_network.sh` also honors `CARGO_TARGET_DIR` and `.omni/runtime/build-target`. Do not publish enrollment files. They contain secrets and are created as 0600 inside 0700 directories. Transfer each `clients/client-NN.json` to its owner through an authenticated encrypted channel. This bootstrap utility generates client keys on the provisioning host; that host must be trusted during enrollment. Keep `server.key`, `enrollments.json` and durable `state.json` protected. Removing a client requires explicit reconciliation of enrollment and state while stopped; a revoked identity cannot silently reappear from persisted state.

The supervisor creates its own network namespace, veth pair, NAT and nftables tables. It rejects conflicting resources and removes its own resources on exit. It saves/restores IPv4 forwarding. Configure the host/cloud firewall to allow UDP 51820 and 51821; existing firewall policies may require additional operator rules. Port 1080 binds only inside the namespace to 10.77.0.1. The namespace drops forwarding between peers: clients reach the constrained local SOCKS process, which opens its own outbound connection. IPv6 public endpoints and UDP/QUIC relay are not implemented.

## Connect a macOS client

Install `wireguard-tools` and the upstream `boringtun-cli` executable, for example with your package manager and `cargo install boringtun-cli --locked`. The supplied supervisor uses the documented macOS `utun` interface and `WG_TUN_NAME_FILE` contract. The external binary is required; `run.sh` does not install a privileged tunnel silently. See [BoringTun's usage documentation](https://github.com/cloudflare/boringtun).

```sh
chmod 600 "$OMNI_VPN_CONFIG"
sudo env PATH="$PATH" ./start_network.sh client --config "$OMNI_VPN_CONFIG"
```

In a separate terminal, configure the local gateway before starting it:

```sh
export OMNI_SOCKS_PROXY=socks5h://10.77.0.1:1080
export OMNI_VPN_REQUIRED=true
./run.sh
```

Set `OMNI_VPN_CONFIG` to the absolute path of the transferred client configuration. The supervisor obtains authenticated admission, starts `boringtun-cli`, installs the single private route and verifies a real WireGuard handshake. Its connection message appears only after this verification. It removes the route and closes its tunnels on normal termination. A system-wide lock prevents competing supervisors. Local models use their local connections; provider TLS remains between the gateway and its chosen remote provider.

This is an administrative CLI deployment, not a signed NetworkExtension distribution. A Tauri ad-hoc build cannot turn itself into an entitled VPN extension. Direct distribution of a macOS packet tunnel as a System Extension requires the appropriate Apple entitlements, provisioning, signing and user approval; see [Apple TN3134](https://developer.apple.com/documentation/technotes/tn3134-network-extension-provider-deployment). No such signed extension artifact is claimed here.

## Authenticated admission and key rotation

The knock is one authenticated packet, not a secret sequence of public port numbers. HMAC-SHA256 covers a versioned request with client ID, timestamp, 128-bit random nonce, action, epoch and optional new public key. A separate domain signs acknowledgements. The verifier checks clock skew ≤30 seconds, constant-time MAC verification, size limits and a bounded nonce table. The Linux server persists accepted nonces before ACK, so restarting cannot replay an accepted packet. IP admission lasts 120 seconds and is refreshed every 60 seconds. Shared NAT can share admission, but each WireGuard identity still needs its private key. Clocks must be synchronized.

Every 1800 seconds the macOS client generates a random X25519 identity and asks the hub to prepare it. The hub gives the new peer a second private address. The client opens a fresh utun, completes a WireGuard handshake, then requests commit. The hub verifies a recent handshake before committing and acknowledging the new epoch. Old and new keys overlap for 30 seconds; the server removes the old peer independently of client cleanup. Pending rotations expire after 60 seconds. The client persists its pending state for recovery and does not treat a timeout as an ACK.

Changing the inner address can interrupt long-lived TCP streams. The gateway should retry only operations known to be safe; a request already submitted to a provider must not be silently replayed. Static identity rotation is additional to WireGuard's automatic ephemeral session rekeying. WireGuard uses Noise, not IKE; see the [WireGuard protocol](https://www.wireguard.com/protocol/).

The idle client uses one small admission renewal per minute, disables persistent WireGuard keepalives and avoids inference work. The relay bounds concurrency and buffers; the control plane writes durable state on accepted control packets or expired peers rather than every idle timer tick. No energy savings benchmark is claimed.

## Verification and current boundary

```sh
cargo test -p omni-vpn --locked
cargo clippy -p omni-vpn --all-targets --locked -- -D warnings
OMNI_VPN_BINARY="${CARGO_TARGET_DIR:-target}/debug/omni-vpn" python3 infra/vpn/test_scripts.py
```

The Rust tests exercise real encrypted six-client exchanges and cross-language HMAC vectors. The non-privileged Python tests verify key independence, file permissions, refusal to overwrite enrollments and persistence. On a Linux test host with the dependencies above, the optional command below creates two disposable namespaces and tests userspace BoringTun against kernel WireGuard, denied admission, a committed fresh identity and old-key expiry:

```sh
sudo env PATH="$PATH" OMNI_VPN_BINARY="$PWD/target/debug/omni-vpn" infra/vpn/test-linux.sh
```

The privileged Linux and macOS deployment paths are supplied but have not been exercised on a real server/macOS utun during this build session. The completed local UDP simulation validates the cryptographic/control behavior, not operating-system deployment, cloud firewall policy, throughput or App Store distribution. Verify the privileged integration test and an actual configured client before exposing a deployed service.
