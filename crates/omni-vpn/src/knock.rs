use anyhow::{bail, ensure, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::{HashMap, HashSet};
use zeroize::Zeroizing;

pub const ADMISSION_TTL: u64 = 120;
pub const CLOCK_SKEW: u64 = 30;
pub const MAX_KNOCK_BYTES: usize = 2048;
const MAX_NONCES: usize = 4096;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Open,
    PrepareRotation,
    CommitRotation,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u8,
    pub client_id: String,
    pub issued_at: u64,
    pub nonce: String,
    pub action: Action,
    pub epoch: u64,
    pub public_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedRequest {
    pub request: Request,
    pub mac: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ack {
    pub client_id: String,
    pub nonce: String,
    pub epoch: u64,
    pub public_key: Option<String>,
    pub accepted_at: u64,
    pub expires_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedAck {
    pub ack: Ack,
    pub mac: String,
}

fn mac_for<T: Serialize>(secret: &[u8; 32], domain: &[u8], value: &T) -> Result<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("fixed HMAC key length");
    mac.update(domain);
    mac.update(&serde_json::to_vec(value)?);
    Ok(STANDARD.encode(mac.finalize().into_bytes()))
}

fn verify_mac<T: Serialize>(
    secret: &[u8; 32],
    domain: &[u8],
    value: &T,
    encoded: &str,
) -> Result<()> {
    let bytes = STANDARD.decode(encoded)?;
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("fixed HMAC key length");
    mac.update(domain);
    mac.update(&serde_json::to_vec(value)?);
    mac.verify_slice(&bytes)
        .map_err(|_| anyhow::anyhow!("invalid authentication"))
}

impl SignedRequest {
    pub fn new(
        client_id: &str,
        secret: &[u8; 32],
        now: u64,
        action: Action,
        epoch: u64,
        public_key: Option<String>,
    ) -> Result<Self> {
        let mut nonce = [0u8; 16];
        OsRng.fill_bytes(&mut nonce);
        let request = Request {
            version: 1,
            client_id: client_id.to_owned(),
            issued_at: now,
            nonce: STANDARD.encode(nonce),
            action,
            epoch,
            public_key,
        };
        let mac = mac_for(secret, b"OMNI-KNOCK-v1\0", &request)?;
        Ok(Self { request, mac })
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        Ok(serde_json::to_vec(self)?)
    }
}

impl SignedAck {
    pub fn issue(request: &Request, secret: &[u8; 32], now: u64) -> Result<Self> {
        let ack = Ack {
            client_id: request.client_id.clone(),
            nonce: request.nonce.clone(),
            epoch: request.epoch,
            public_key: request.public_key.clone(),
            accepted_at: now,
            expires_at: now.saturating_add(ADMISSION_TTL),
        };
        let mac = mac_for(secret, b"OMNI-KNOCK-ACK-v1\0", &ack)?;
        Ok(Self { ack, mac })
    }

    pub fn verify(&self, request: &Request, secret: &[u8; 32], now: u64) -> Result<()> {
        verify_mac(secret, b"OMNI-KNOCK-ACK-v1\0", &self.ack, &self.mac)?;
        ensure!(
            self.ack.client_id == request.client_id
                && self.ack.nonce == request.nonce
                && self.ack.epoch == request.epoch
                && self.ack.public_key == request.public_key,
            "acknowledgement mismatch"
        );
        ensure!(
            self.ack.accepted_at.abs_diff(now) <= CLOCK_SKEW
                && now < self.ack.expires_at
                && self.ack.expires_at.saturating_sub(self.ack.accepted_at) <= ADMISSION_TTL,
            "expired acknowledgement"
        );
        Ok(())
    }
}

/// Bounded anti-replay table. It fails closed when full; invalid MACs never allocate state.
/// Production persists accepted nonces before installing a firewall admission.
pub struct Verifier {
    secrets: HashMap<String, Zeroizing<[u8; 32]>>,
    nonces: HashMap<(String, String), u64>,
}

impl Default for Verifier {
    fn default() -> Self {
        Self::new()
    }
}
impl Verifier {
    pub fn new() -> Self {
        Self {
            secrets: HashMap::new(),
            nonces: HashMap::new(),
        }
    }
    pub fn enroll(&mut self, client_id: &str, secret: [u8; 32]) -> Result<()> {
        ensure!(
            !client_id.is_empty()
                && client_id.len() <= 64
                && client_id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "invalid client id"
        );
        ensure!(
            !self.secrets.contains_key(client_id),
            "client already enrolled"
        );
        self.secrets
            .insert(client_id.to_owned(), Zeroizing::new(secret));
        Ok(())
    }
    pub fn restore_nonces(&mut self, entries: Vec<(String, String, u64)>, now: u64) -> Result<()> {
        ensure!(entries.len() <= MAX_NONCES, "nonce store too large");
        let mut seen = HashSet::new();
        for (client, nonce, expiry) in entries {
            if expiry > now && seen.insert((client.clone(), nonce.clone())) {
                self.nonces.insert((client, nonce), expiry);
            }
        }
        Ok(())
    }
    pub fn nonce_entries(&self) -> Vec<(String, String, u64)> {
        self.nonces
            .iter()
            .map(|((id, nonce), expiry)| (id.clone(), nonce.clone(), *expiry))
            .collect()
    }
    pub fn authenticate(&mut self, bytes: &[u8], now: u64) -> Result<SignedRequest> {
        ensure!(bytes.len() <= MAX_KNOCK_BYTES, "knock exceeds limit");
        let signed: SignedRequest = serde_json::from_slice(bytes)?;
        let request = &signed.request;
        ensure!(request.version == 1, "unsupported knock version");
        let secret = self
            .secrets
            .get(&request.client_id)
            .ok_or_else(|| anyhow::anyhow!("unknown client"))?;
        verify_mac(secret, b"OMNI-KNOCK-v1\0", request, &signed.mac)?;
        ensure!(request.issued_at.abs_diff(now) <= CLOCK_SKEW, "stale knock");
        ensure!(
            STANDARD.decode(&request.nonce)?.len() == 16,
            "invalid nonce"
        );
        if let Some(public_key) = &request.public_key {
            super::decode_key(public_key)?;
        }
        ensure!(
            (request.action == Action::Open && request.public_key.is_none())
                || (request.action != Action::Open && request.public_key.is_some()),
            "invalid action fields"
        );
        self.nonces.retain(|_, expiry| *expiry > now);
        let key = (request.client_id.clone(), request.nonce.clone());
        ensure!(!self.nonces.contains_key(&key), "replayed knock");
        if self.nonces.len() >= MAX_NONCES {
            bail!("admission capacity reached");
        }
        // Future timestamps remain replay-protected for the entire allowed acceptance window.
        self.nonces
            .insert(key, request.issued_at.saturating_add(CLOCK_SKEW + 1));
        Ok(signed)
    }
    pub fn acknowledge(&self, request: &Request, now: u64) -> Result<SignedAck> {
        let secret = self
            .secrets
            .get(&request.client_id)
            .ok_or_else(|| anyhow::anyhow!("unknown client"))?;
        SignedAck::issue(request, secret, now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canonical_mac_matches_python_control_client() {
        // Independently calculated with Python's hashlib/hmac. These are public test keys.
        let secret = std::array::from_fn(|i| i as u8);
        let request = Request {
            version: 1,
            client_id: "client-01".into(),
            issued_at: 10000,
            nonce: "AAECAwQFBgcICQoLDA0ODw==".into(),
            action: Action::PrepareRotation,
            epoch: 1,
            public_key: Some("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=".into()),
        };
        assert_eq!(
            mac_for(&secret, b"OMNI-KNOCK-v1\0", &request).unwrap(),
            "I54ExA+CJAgRIDaRWfXxdX2aUNgQQhBPw30nZcGISh8="
        );
        assert_eq!(
            SignedAck::issue(&request, &secret, 10000).unwrap().mac,
            "7hLrD447G/FuvXOxgG+T+iBrG1ms/j6fOx4ULk17zVM="
        );
    }
    #[test]
    fn knocking_rejects_wrong_secret_replay_and_stale_packets() {
        let mut verifier = Verifier::new();
        verifier.enroll("alice", [7; 32]).unwrap();
        let wrong = SignedRequest::new("alice", &[8; 32], 100, Action::Open, 0, None).unwrap();
        assert!(verifier
            .authenticate(&wrong.to_bytes().unwrap(), 100)
            .is_err());
        let valid = SignedRequest::new("alice", &[7; 32], 100, Action::Open, 0, None).unwrap();
        let bytes = valid.to_bytes().unwrap();
        let verified = verifier.authenticate(&bytes, 100).unwrap();
        let ack = verifier.acknowledge(&verified.request, 100).unwrap();
        ack.verify(&valid.request, &[7; 32], 100).unwrap();
        assert!(verifier.authenticate(&bytes, 100).is_err());
        assert!(verifier.authenticate(&bytes, 131).is_err());
        assert!(ack.verify(&wrong.request, &[7; 32], 100).is_err());
        assert!(ack.verify(&valid.request, &[7; 32], 221).is_err());
    }
    #[test]
    fn persisted_nonce_rejects_after_restart() {
        let mut verifier = Verifier::new();
        verifier.enroll("a", [1; 32]).unwrap();
        let msg = SignedRequest::new("a", &[1; 32], 50, Action::Open, 0, None)
            .unwrap()
            .to_bytes()
            .unwrap();
        verifier.authenticate(&msg, 50).unwrap();
        let mut restarted = Verifier::new();
        restarted.enroll("a", [1; 32]).unwrap();
        restarted
            .restore_nonces(verifier.nonce_entries(), 51)
            .unwrap();
        assert!(restarted.authenticate(&msg, 51).is_err());
    }
}
