//! All application payloads and provider calls in this module are synthetic.
//! Production servers forward provider TLS without terminating or decoding it.
use crate::{
    encode_key,
    knock::{Action, SignedAck, SignedRequest, Verifier},
    rotation::{Rotation, OVERLAP_SECONDS, ROTATION_SECONDS},
    wire::{udp_frame, udp_payload, Peer},
};
use anyhow::{bail, ensure, Context, Result};
use boringtun::x25519::{PublicKey, StaticSecret};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpStream, UdpSocket},
    time::Duration,
};

#[derive(Serialize)]
pub struct Report {
    pub simulation: bool,
    pub transport: &'static str,
    pub passed: bool,
    pub clients: usize,
    pub rounds: usize,
    pub rotation_interval_seconds: u64,
    pub clock: &'static str,
    pub events: Vec<Value>,
    pub assertions: Vec<Value>,
}

struct Session {
    peer: Peer,
    expires_at: Option<u64>,
}
struct Hub {
    socket: UdpSocket,
    verifier: Verifier,
    sessions: HashMap<SocketAddr, Session>,
    admissions: HashMap<SocketAddr, u64>,
    private: [u8; 32],
    public: [u8; 32],
    providers: Vec<String>,
    encrypted_datagrams: u64,
}
struct Path {
    peer: Peer,
    socket: UdpSocket,
    ip: Ipv4Addr,
}
struct Client {
    id: String,
    secret: [u8; 32],
    keys: Rotation,
    path: Path,
}

fn socket() -> Result<UdpSocket> {
    let socket = UdpSocket::bind("127.0.0.1:0")?;
    socket.set_read_timeout(Some(Duration::from_secs(2)))?;
    Ok(socket)
}
impl Hub {
    fn new(providers: Vec<String>) -> Result<Self> {
        for provider in &providers {
            provider_address(provider)?;
        }
        let private = crate::random_key();
        let public = PublicKey::from(&StaticSecret::from(private)).to_bytes();
        Ok(Self {
            socket: socket()?,
            verifier: Verifier::new(),
            sessions: HashMap::new(),
            admissions: HashMap::new(),
            private,
            public,
            providers,
            encrypted_datagrams: 0,
        })
    }
    fn register(&mut self, path: &Path, public: [u8; 32], index: u32) -> Result<()> {
        self.sessions.insert(
            path.socket.local_addr()?,
            Session {
                peer: Peer::new(self.private, public, index),
                expires_at: None,
            },
        );
        Ok(())
    }
    fn receive_knock(&mut self, now: u64) -> Result<SignedRequest> {
        let mut buffer = [0; 4096];
        let (count, from) = self.socket.recv_from(&mut buffer)?;
        let signed = self.verifier.authenticate(&buffer[..count], now)?;
        self.admissions
            .insert(from, now + crate::knock::ADMISSION_TTL);
        let ack = self.verifier.acknowledge(&signed.request, now)?;
        self.socket.send_to(&serde_json::to_vec(&ack)?, from)?;
        Ok(signed)
    }
    fn receive_wire(&mut self, now: u64) -> Result<(SocketAddr, crate::wire::Received)> {
        let mut buffer = [0; 65536];
        let (count, from) = self.socket.recv_from(&mut buffer)?;
        self.encrypted_datagrams += 1;
        ensure!(
            self.admissions
                .get(&from)
                .is_some_and(|expires| now < *expires),
            "closed admission"
        );
        self.sessions
            .retain(|_, session| session.expires_at.is_none_or(|expires| now < expires));
        let session = self
            .sessions
            .get_mut(&from)
            .ok_or_else(|| anyhow::anyhow!("retired or unknown key"))?;
        let received = session.peer.receive(from.ip(), &buffer[..count])?;
        Ok((from, received))
    }
}
fn knock(
    hub: &mut Hub,
    path: &Path,
    message: &SignedRequest,
    secret: &[u8; 32],
    now: u64,
) -> Result<()> {
    path.socket
        .send_to(&message.to_bytes()?, hub.socket.local_addr()?)?;
    hub.receive_knock(now)?;
    let mut buffer = [0; 4096];
    let (count, from) = path.socket.recv_from(&mut buffer)?;
    ensure!(
        from == hub.socket.local_addr()?,
        "unexpected knock acknowledgement source"
    );
    let ack: SignedAck = serde_json::from_slice(&buffer[..count])?;
    ack.verify(&message.request, secret, now)
}
fn open(hub: &mut Hub, client: &Client, now: u64) -> Result<()> {
    let message = SignedRequest::new(
        &client.id,
        &client.secret,
        now,
        Action::Open,
        client.keys.active.epoch,
        None,
    )?;
    knock(hub, &client.path, &message, &client.secret, now)
}

/// Drive real UDP datagrams in both directions until one synthetic response returns.
fn exchange(hub: &mut Hub, path: &mut Path, task: Value, now: u64) -> Result<Value> {
    let frame = udp_frame(
        path.ip,
        Ipv4Addr::new(10, 77, 0, 1),
        &serde_json::to_vec(&task)?,
    )?;
    let mut outbound = path.peer.encapsulate(&frame)?;
    let mut expected: Option<Value> = None;
    for _ in 0..64 {
        for packet in outbound.drain(..) {
            path.socket.send_to(&packet, hub.socket.local_addr()?)?;
            let (from, received) = hub.receive_wire(now)?;
            for output in received.network {
                hub.socket.send_to(&output, from)?;
            }
            for inner in received.packets {
                ensure!(inner == frame, "decrypted request mismatch");
                let request: Value = serde_json::from_slice(udp_payload(&inner)?)?;
                let response = if request["kind"] == "inference" {
                    let client = request["client"].as_str().context("client id missing")?;
                    let round = request["round"].as_u64().context("round missing")?;
                    if hub.providers.is_empty() {
                        json!({"simulation":true,"provider":"synthetic-in-process","content":format!("SYNTHETIC reply for {client}, round {round}"),"usage":{"total_tokens":12}})
                    } else {
                        let index = request["provider_index"]
                            .as_u64()
                            .context("provider missing")?
                            as usize
                            % hub.providers.len();
                        fake_provider(&hub.providers[index], client, round)?
                    }
                } else {
                    json!({"simulation":true,"kind":"handshake_probe_ack"})
                };
                let reply = udp_frame(
                    Ipv4Addr::new(10, 77, 0, 1),
                    path.ip,
                    &serde_json::to_vec(&response)?,
                )?;
                expected = Some(response);
                for output in hub
                    .sessions
                    .get_mut(&from)
                    .context("session missing")?
                    .peer
                    .encapsulate(&reply)?
                {
                    hub.socket.send_to(&output, from)?;
                }
            }
        }
        let mut buffer = [0; 65536];
        let (count, from) = path
            .socket
            .recv_from(&mut buffer)
            .context("WireGuard response timed out")?;
        ensure!(
            from == hub.socket.local_addr()?,
            "unexpected WireGuard source"
        );
        let received = path.peer.receive(from.ip(), &buffer[..count])?;
        outbound.extend(received.network);
        if let Some(inner) = received.packets.into_iter().next() {
            let value: Value = serde_json::from_slice(udp_payload(&inner)?)?;
            ensure!(
                expected.as_ref() == Some(&value),
                "decrypted response mismatch"
            );
            ensure!(path.peer.has_handshake(), "missing WireGuard handshake");
            return Ok(value);
        }
    }
    bail!("WireGuard exchange exceeded step limit")
}

fn provider_address(url: &str) -> Result<SocketAddr> {
    let authority = url
        .strip_prefix("http://")
        .context("simulation providers must use explicit loopback HTTP")?;
    ensure!(
        !authority.contains('/') && !authority.contains('?') && !authority.contains('#'),
        "provider must be origin only"
    );
    let addr: SocketAddr = authority
        .parse()
        .context("provider must use a literal loopback address and port")?;
    ensure!(
        addr.ip().is_loopback() && addr.port() != 0,
        "only loopback fake providers allowed"
    );
    Ok(addr)
}
fn fake_provider(url: &str, client: &str, round: u64) -> Result<Value> {
    let address = provider_address(url)?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    let request = serde_json::to_vec(&json!({"model":"omni-synthetic","stream":false,
        "messages":[{"role":"user","content":format!("SYNTHETIC simulation task for {client}, round {round}. No personal data.")}]}))?;
    write!(stream, "POST /v1/chat/completions HTTP/1.1\r\nHost: {address}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", request.len())?;
    stream.write_all(&request)?;
    let mut bytes = Vec::new();
    stream.take(65537).read_to_end(&mut bytes)?;
    ensure!(bytes.len() <= 65536, "fake provider response too large");
    let separator = bytes
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .context("invalid fake provider HTTP")?;
    let header = std::str::from_utf8(&bytes[..separator])?;
    ensure!(
        header.starts_with("HTTP/1.1 200 ") || header.starts_with("HTTP/1.0 200 "),
        "fake provider returned non-200 response"
    );
    ensure!(
        !header.to_lowercase().contains("transfer-encoding:"),
        "fake provider must return a bounded Content-Length response"
    );
    let response: Value = serde_json::from_slice(&bytes[separator + 4..])?;
    let content = response["choices"][0]["message"]["content"]
        .as_str()
        .context("fake provider missing content")?;
    let mut end = content.len().min(700);
    while !content.is_char_boundary(end) {
        end -= 1;
    }
    Ok(
        json!({"simulation":true,"provider":url,"content":&content[..end],"truncated":end < content.len(),
        "usage":{"prompt_tokens":response["usage"]["prompt_tokens"].as_u64().unwrap_or(0),
        "completion_tokens":response["usage"]["completion_tokens"].as_u64().unwrap_or(0),
        "total_tokens":response["usage"]["total_tokens"].as_u64().unwrap_or(0)}}),
    )
}

pub fn run(count: usize, rounds: usize, providers: Vec<String>) -> Result<Report> {
    ensure!(
        (6..=32).contains(&count),
        "simulation requires 6..32 clients"
    );
    ensure!(
        (2..=20).contains(&rounds),
        "simulation requires 2..20 rounds to exercise rotation"
    );
    let mut hub = Hub::new(providers)?;
    let mut report = Report {
        simulation: true,
        transport: "real localhost UDP / boringtun WireGuard / synthetic IPv4+UDP",
        passed: false,
        clients: count,
        rounds,
        rotation_interval_seconds: ROTATION_SECONDS,
        clock: "accelerated logical rotation/admission clock; real WireGuard cryptographic timers",
        events: vec![],
        assertions: vec![],
    };
    let mut clients = Vec::new();
    let mut now = 10_000u64;
    for index in 0..count {
        let id = format!("client-{:02}", index + 1);
        let secret = crate::random_key();
        let keys = Rotation::new(now);
        let path = Path {
            peer: Peer::new(*keys.active.private, hub.public, index as u32 + 1),
            socket: socket()?,
            ip: Ipv4Addr::new(10, 77, 1, index as u8 + 2),
        };
        hub.verifier.enroll(&id, secret)?;
        hub.register(&path, keys.active.public, 1000 + index as u32)?;
        clients.push(Client {
            id,
            secret,
            keys,
            path,
        });
    }
    // Bad knocks are actually delivered over UDP and rejected without an acknowledgement.
    let invalid = SignedRequest::new(&clients[0].id, &[0; 32], now, Action::Open, 0, None)?;
    clients[0]
        .path
        .socket
        .send_to(&invalid.to_bytes()?, hub.socket.local_addr()?)?;
    ensure!(hub.receive_knock(now).is_err(), "wrong HMAC was accepted");
    report
        .assertions
        .push(json!({"name":"wrong_knock_rejected","passed":true}));
    let valid = SignedRequest::new(
        &clients[0].id,
        &clients[0].secret,
        now,
        Action::Open,
        0,
        None,
    )?;
    knock(&mut hub, &clients[0].path, &valid, &clients[0].secret, now)?;
    clients[0]
        .path
        .socket
        .send_to(&valid.to_bytes()?, hub.socket.local_addr()?)?;
    ensure!(hub.receive_knock(now).is_err(), "replayed knock accepted");
    report
        .assertions
        .push(json!({"name":"replayed_knock_rejected","passed":true}));
    for client in &clients {
        open(&mut hub, client, now)?;
    }
    for round in 0..rounds {
        for (index, client) in clients.iter_mut().enumerate() {
            open(&mut hub, client, now)?;
            let response = exchange(
                &mut hub,
                &mut client.path,
                json!({"simulation":true,"kind":"inference","client":client.id,"round":round,"provider_index":index+round}),
                now,
            )?;
            report.events.push(json!({"type":"encrypted_roundtrip","client":client.id,"epoch":client.keys.active.epoch,
                "logical_time":now,"provider":response["provider"],"response_bytes":response["content"].as_str().unwrap_or("").len(),"usage":response["usage"]}));
        }
        if round + 1 == rounds {
            break;
        }
        now += ROTATION_SECONDS;
        let mut old_paths = Vec::new();
        for (index, client) in clients.iter_mut().enumerate() {
            open(&mut hub, client, now)?;
            let next = client.keys.prepare(now)?;
            let next_epoch = next.epoch;
            let public = next.public;
            let mut path = Path {
                peer: Peer::new(
                    *next.private,
                    hub.public,
                    100 + (round * count + index) as u32,
                ),
                socket: socket()?,
                ip: Ipv4Addr::new(10, 77, 2 + (round % 2) as u8, index as u8 + 2),
            };
            let request = SignedRequest::new(
                &client.id,
                &client.secret,
                now,
                Action::PrepareRotation,
                next_epoch,
                Some(encode_key(&public)),
            )?;
            knock(&mut hub, &path, &request, &client.secret, now)?;
            hub.register(&path, public, 2000 + (round * count + index) as u32)?;
            exchange(&mut hub, &mut path, json!({"kind":"probe"}), now)?;
            let commit = SignedRequest::new(
                &client.id,
                &client.secret,
                now,
                Action::CommitRotation,
                next_epoch,
                Some(encode_key(&public)),
            )?;
            knock(&mut hub, &path, &commit, &client.secret, now)?;
            client.keys.acknowledge(next_epoch, &public, now)?;
            let mut old = std::mem::replace(&mut client.path, path);
            hub.sessions
                .get_mut(&old.socket.local_addr()?)
                .context("old peer missing")?
                .expires_at = Some(now + OVERLAP_SECONDS);
            exchange(&mut hub, &mut old, json!({"kind":"probe"}), now)?;
            old_paths.push(old);
            report.events.push(json!({"type":"key_rotation_acknowledged","client":client.id,"epoch":next_epoch,"logical_time":now,"overlap_seconds":OVERLAP_SECONDS,"fresh_random_key":true}));
        }
        now += OVERLAP_SECONDS + 1;
        for (index, mut old) in old_paths.into_iter().enumerate() {
            let frame = udp_frame(old.ip, Ipv4Addr::new(10, 77, 0, 1), b"retired identity")?;
            for packet in old.peer.encapsulate(&frame)? {
                old.socket.send_to(&packet, hub.socket.local_addr()?)?;
                ensure!(hub.receive_wire(now).is_err(), "retired key accepted");
            }
            clients[index].keys.expire(now);
        }
    }
    report
        .assertions
        .push(json!({"name":"all_clients_rotated_after_ack_with_overlap","passed":true}));
    report
        .assertions
        .push(json!({"name":"retired_keys_rejected","passed":true}));
    let path = &mut clients[0].path;
    let frame = udp_frame(
        path.ip,
        Ipv4Addr::new(10, 77, 0, 1),
        b"tamper and replay check",
    )?;
    let packets = path.peer.encapsulate(&frame)?;
    ensure!(packets.len() == 1, "expected established data packet");
    let mut corrupt = packets[0].clone();
    let last = corrupt.len() - 1;
    corrupt[last] ^= 0x80;
    path.socket.send_to(&corrupt, hub.socket.local_addr()?)?;
    ensure!(
        hub.receive_wire(now).is_err(),
        "tampered ciphertext accepted"
    );
    path.socket.send_to(&packets[0], hub.socket.local_addr()?)?;
    let (_, valid) = hub.receive_wire(now)?;
    ensure!(valid.packets.len() == 1, "valid packet failed after tamper");
    path.socket.send_to(&packets[0], hub.socket.local_addr()?)?;
    ensure!(hub.receive_wire(now).is_err(), "WireGuard replay accepted");
    report
        .assertions
        .push(json!({"name":"ciphertext_tamper_rejected","passed":true}));
    report
        .assertions
        .push(json!({"name":"wireguard_packet_replay_rejected","passed":true}));
    now += crate::knock::ADMISSION_TTL + 1;
    for packet in path.peer.encapsulate(&frame)? {
        path.socket.send_to(&packet, hub.socket.local_addr()?)?;
        ensure!(
            hub.receive_wire(now).is_err(),
            "expired knock admission accepted"
        );
    }
    report
        .assertions
        .push(json!({"name":"expired_admission_rejected","passed":true}));
    report.assertions.push(
        json!({"name":"encrypted_bidirectional_roundtrips","passed":true,"count":count*rounds}),
    );
    report
        .events
        .push(json!({"type":"transport_totals","encrypted_datagrams":hub.encrypted_datagrams}));
    report.passed = true;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_external_fake_provider_urls() {
        assert!(provider_address("https://api.example.com").is_err());
        assert!(provider_address("http://8.8.8.8:80").is_err());
        assert!(provider_address("http://127.0.0.1:4101/path").is_err());
        assert!(provider_address("http://127.0.0.1:4101").is_ok());
    }
    #[test]
    fn six_clients_exchange_and_rotate_over_udp() {
        let report = run(6, 2, vec![]).unwrap();
        assert!(report.passed);
        assert_eq!(
            report
                .events
                .iter()
                .filter(|e| e["type"] == "encrypted_roundtrip")
                .count(),
            12
        );
    }
}
