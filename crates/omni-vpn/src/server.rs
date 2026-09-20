//! Privileged Linux control plane. Called only by an explicitly deployed VPN server.
use crate::{
    knock::{Action, Verifier, ADMISSION_TTL},
    rotation::OVERLAP_SECONDS,
};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    net::{IpAddr, Ipv4Addr, UdpSocket},
    path::Path,
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Config {
    clients: Vec<Enrollment>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Enrollment {
    id: String,
    knock_secret: String,
    public_key: String,
    addresses: [String; 2],
}
#[derive(Clone, Serialize, Deserialize)]
struct Pending {
    epoch: u64,
    public_key: String,
    expires_at: u64,
}
#[derive(Clone, Serialize, Deserialize)]
struct Previous {
    public_key: String,
    expires_at: u64,
}
#[derive(Clone, Serialize, Deserialize)]
struct ClientState {
    epoch: u64,
    public_key: String,
    pending: Option<Pending>,
    previous: Option<Previous>,
}
#[derive(Serialize, Deserialize, Default)]
struct State {
    clients: HashMap<String, ClientState>,
    nonces: Vec<(String, String, u64)>,
}
fn now() -> Result<u64> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs())
}
fn execute(program: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .with_context(|| format!("cannot execute {program}"))?;
    ensure!(
        output.status.success(),
        "{program} failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    );
    Ok(String::from_utf8(output.stdout)?)
}
fn remove_peer(interface: &str, key: &str) -> Result<()> {
    execute("wg", &["set", interface, "peer", key, "remove"])?;
    Ok(())
}
fn add_peer(interface: &str, key: &str, address: &str) -> Result<()> {
    execute(
        "wg",
        &["set", interface, "peer", key, "allowed-ips", address],
    )?;
    Ok(())
}
fn private_file(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        ensure!(
            fs::metadata(path)?.permissions().mode() & 0o077 == 0,
            "{} must not be accessible to group/others",
            path.display()
        );
    }
    Ok(())
}
fn save(path: &Path, state: &State) -> Result<()> {
    let temporary = path.with_extension("tmp");
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    file.write_all(&serde_json::to_vec(state)?)?;
    file.sync_all()?;
    fs::rename(temporary, path)?;
    if let Some(parent) = path.parent() {
        fs::File::open(parent)?.sync_all()?;
    }
    Ok(())
}
fn admission(ip: IpAddr) -> Result<()> {
    ensure!(
        ip.is_ipv4(),
        "production knock admission currently supports IPv4 endpoints only"
    );
    let ip = ip.to_string();
    // Deletion may fail when no entry exists; addition must succeed before ACK.
    let _ = Command::new("nft")
        .args([
            "delete",
            "element",
            "inet",
            "omni_gate",
            "admitted4",
            "{",
            &ip,
            "}",
        ])
        .output();
    execute(
        "nft",
        &[
            "add",
            "element",
            "inet",
            "omni_gate",
            "admitted4",
            "{",
            &ip,
            "timeout",
            &format!("{ADMISSION_TTL}s"),
            "}",
        ],
    )?;
    Ok(())
}
fn recent_handshake(interface: &str, key: &str, now: u64) -> Result<bool> {
    let text = execute("wg", &["show", interface, "latest-handshakes"])?;
    Ok(text.lines().any(|line| {
        let mut fields = line.split_whitespace();
        fields.next() == Some(key)
            && fields
                .next()
                .and_then(|v| v.parse::<u64>().ok())
                .is_some_and(|t| t > 0 && t.abs_diff(now) <= 30)
    }))
}
fn cleanup(state: &mut State, interface: &str, now: u64) -> Result<bool> {
    let mut changed = false;
    for client in state.clients.values_mut() {
        if client.pending.as_ref().is_some_and(|p| now >= p.expires_at) {
            let p = client.pending.take().expect("checked");
            remove_peer(interface, &p.public_key)?;
            changed = true;
        }
        if client
            .previous
            .as_ref()
            .is_some_and(|p| now >= p.expires_at)
        {
            let p = client.previous.take().expect("checked");
            remove_peer(interface, &p.public_key)?;
            changed = true;
        }
    }
    Ok(changed)
}
pub fn run(bind: &str, clients_path: &str, state_path: &str, interface: &str) -> Result<()> {
    ensure!(
        cfg!(target_os = "linux"),
        "knock-server requires Linux nftables and WireGuard"
    );
    ensure!(
        !interface.is_empty()
            && interface.len() <= 15
            && interface
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'),
        "invalid interface"
    );
    private_file(Path::new(clients_path))?;
    let config: Config = serde_json::from_slice(&fs::read(clients_path)?)?;
    ensure!(
        !config.clients.is_empty() && config.clients.len() <= 128,
        "enroll 1..128 clients per hub"
    );
    let mut verifier = Verifier::new();
    let mut enrollments = HashMap::new();
    for enrollment in config.clients {
        crate::decode_key(&enrollment.public_key)?;
        for address in &enrollment.addresses {
            let raw = address
                .strip_suffix("/32")
                .context("client addresses must be IPv4 /32")?;
            let ip: Ipv4Addr = raw.parse()?;
            ensure!(ip.is_private(), "client address must be private");
        }
        ensure!(
            enrollment.addresses[0] != enrollment.addresses[1],
            "rotation addresses must differ"
        );
        for existing in enrollments.values() {
            let existing: &Enrollment = existing;
            ensure!(
                existing.public_key != enrollment.public_key
                    && !existing
                        .addresses
                        .iter()
                        .any(|a| enrollment.addresses.contains(a)),
                "duplicate peer key/address"
            );
        }
        verifier.enroll(&enrollment.id, crate::decode_key(&enrollment.knock_secret)?)?;
        enrollments.insert(enrollment.id.clone(), enrollment);
    }
    let path = Path::new(state_path);
    let mut state: State = if path.exists() {
        private_file(path)?;
        serde_json::from_slice(&fs::read(path)?)?
    } else {
        State::default()
    };
    for (id, enrollment) in &enrollments {
        state
            .clients
            .entry(id.clone())
            .or_insert_with(|| ClientState {
                epoch: 0,
                public_key: enrollment.public_key.clone(),
                pending: None,
                previous: None,
            });
    }
    ensure!(
        state.clients.keys().all(|id| enrollments.contains_key(id)),
        "state contains revoked/unconfigured client; reconcile explicitly before startup"
    );
    verifier.restore_nonces(state.nonces.clone(), now()?)?;
    cleanup(&mut state, interface, now()?)?;
    for (id, client) in &state.clients {
        let enrollment = &enrollments[id];
        add_peer(
            interface,
            &client.public_key,
            &enrollment.addresses[(client.epoch % 2) as usize],
        )?;
        if let Some(p) = &client.pending {
            add_peer(
                interface,
                &p.public_key,
                &enrollment.addresses[(p.epoch % 2) as usize],
            )?;
        }
        if let Some(p) = &client.previous {
            add_peer(
                interface,
                &p.public_key,
                &enrollment.addresses[((client.epoch + 1) % 2) as usize],
            )?;
        }
    }
    save(path, &state)?;
    let socket = UdpSocket::bind(bind)?;
    socket.set_read_timeout(Some(Duration::from_secs(1)))?;
    eprintln!(
        "OMNI authenticated admission listening on {}",
        socket.local_addr()?
    );
    let mut buffer = [0; crate::knock::MAX_KNOCK_BYTES + 1];
    loop {
        let timestamp = now()?;
        if cleanup(&mut state, interface, timestamp)? {
            save(path, &state)?;
        }
        let (size, source) = match socket.recv_from(&mut buffer) {
            Ok(v) => v,
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                continue
            }
            Err(e) => return Err(e.into()),
        };
        let signed = match verifier.authenticate(&buffer[..size], timestamp) {
            Ok(v) => v,
            Err(_) => continue,
        };
        state.nonces = verifier.nonce_entries();
        save(path, &state)?; // Never ACK before durable replay protection.
        let request = &signed.request;
        let accepted = (|| -> Result<()> {
            let enrollment = &enrollments[&request.client_id];
            let key = request.public_key.as_deref().unwrap_or("");
            if request.action == Action::PrepareRotation {
                for (other_id, other) in &state.clients {
                    if other_id != &request.client_id {
                        ensure!(
                            other.public_key != key
                                && other.pending.as_ref().is_none_or(|p| p.public_key != key)
                                && other.previous.as_ref().is_none_or(|p| p.public_key != key),
                            "key already assigned"
                        );
                    }
                }
            }
            let client = state
                .clients
                .get_mut(&request.client_id)
                .context("missing client")?;
            match request.action {
                Action::Open => ensure!(request.epoch == client.epoch, "stale client identity"),
                Action::PrepareRotation => {
                    ensure!(
                        Some(request.epoch) == client.epoch.checked_add(1)
                            && key != client.public_key,
                        "invalid next identity"
                    );
                    ensure!(client.previous.is_none(), "rotation overlap still active");
                    if let Some(p) = &client.pending {
                        ensure!(
                            p.epoch == request.epoch && p.public_key == key,
                            "different rotation pending"
                        );
                    } else {
                        add_peer(
                            interface,
                            key,
                            &enrollment.addresses[(request.epoch % 2) as usize],
                        )?;
                        client.pending = Some(Pending {
                            epoch: request.epoch,
                            public_key: key.into(),
                            expires_at: timestamp + 60,
                        });
                    }
                }
                Action::CommitRotation => {
                    if request.epoch == client.epoch && key == client.public_key { /* Idempotent commit with a new authenticated nonce. */
                    } else {
                        let pending = client.pending.as_ref().context("no prepared rotation")?;
                        ensure!(
                            pending.epoch == request.epoch && pending.public_key == key,
                            "unprepared key"
                        );
                        ensure!(
                            recent_handshake(interface, key, timestamp)?,
                            "new identity has not completed a recent WireGuard handshake"
                        );
                        client.previous = Some(Previous {
                            public_key: client.public_key.clone(),
                            expires_at: timestamp + OVERLAP_SECONDS,
                        });
                        client.epoch = request.epoch;
                        client.public_key = key.into();
                        client.pending = None;
                    }
                }
            }
            admission(source.ip())?;
            Ok(())
        })();
        if accepted.is_err() {
            continue;
        }
        save(path, &state)?;
        let ack = verifier.acknowledge(request, timestamp)?;
        socket.send_to(&serde_json::to_vec(&ack)?, source)?;
    }
}
