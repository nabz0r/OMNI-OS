//! WireGuard packets use boringtun, never an OMNI replacement cipher.
//! HMAC admission is an additional control plane, independent of WireGuard identity.
pub mod knock;
pub mod rotation;
pub mod server;
pub mod simulation;
pub mod wire;

use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{rngs::OsRng, RngCore};

pub fn random_key() -> [u8; 32] {
    let mut key = [0; 32];
    OsRng.fill_bytes(&mut key);
    key
}

pub fn encode_key(key: &[u8; 32]) -> String {
    STANDARD.encode(key)
}

pub fn decode_key(value: &str) -> anyhow::Result<[u8; 32]> {
    STANDARD
        .decode(value.trim())?
        .try_into()
        .map_err(|_| anyhow::anyhow!("key must contain 32 bytes"))
}
