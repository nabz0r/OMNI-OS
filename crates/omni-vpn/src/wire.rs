use anyhow::{bail, ensure, Result};
use boringtun::{
    noise::{Tunn, TunnResult},
    x25519::{PublicKey, StaticSecret},
};
use std::net::{IpAddr, Ipv4Addr};

const BUFFER: usize = 65568;
pub struct Peer {
    tunnel: Tunn,
}
#[derive(Default)]
pub struct Received {
    pub network: Vec<Vec<u8>>,
    pub packets: Vec<Vec<u8>>,
}

impl Peer {
    pub fn new(private: [u8; 32], remote_public: [u8; 32], index: u32) -> Self {
        Self {
            tunnel: Tunn::new(
                StaticSecret::from(private),
                PublicKey::from(remote_public),
                None,
                None,
                index,
                None,
            ),
        }
    }
    pub fn encapsulate(&mut self, packet: &[u8]) -> Result<Vec<Vec<u8>>> {
        ensure!(packet.len() <= 65535, "IP packet too large");
        let mut buffer = vec![0; BUFFER];
        match self.tunnel.encapsulate(packet, &mut buffer) {
            TunnResult::WriteToNetwork(bytes) => Ok(vec![bytes.to_vec()]),
            TunnResult::Done => Ok(vec![]),
            TunnResult::Err(error) => bail!("WireGuard encapsulation: {error:?}"),
            _ => bail!("unexpected encapsulation output"),
        }
    }
    pub fn receive(&mut self, sender: IpAddr, datagram: &[u8]) -> Result<Received> {
        ensure!(datagram.len() <= 65535, "datagram too large");
        let mut buffer = vec![0; BUFFER];
        let mut result = Received::default();
        let mut current = datagram;
        for _ in 0..256 {
            match self.tunnel.decapsulate(Some(sender), current, &mut buffer) {
                TunnResult::WriteToNetwork(bytes) => result.network.push(bytes.to_vec()),
                TunnResult::WriteToTunnelV4(bytes, _) | TunnResult::WriteToTunnelV6(bytes, _) => {
                    result.packets.push(bytes.to_vec())
                }
                TunnResult::Done => return Ok(result),
                TunnResult::Err(error) => bail!("WireGuard authentication/packet error: {error:?}"),
            }
            current = &[];
        }
        bail!("WireGuard output queue exceeded limit")
    }
    pub fn timers(&mut self) -> Result<Vec<Vec<u8>>> {
        let mut buffer = vec![0; BUFFER];
        match self.tunnel.update_timers(&mut buffer) {
            TunnResult::WriteToNetwork(bytes) => Ok(vec![bytes.to_vec()]),
            TunnResult::Done => Ok(vec![]),
            TunnResult::Err(error) => bail!("WireGuard timer error: {error:?}"),
            _ => bail!("unexpected timer output"),
        }
    }
    pub fn has_handshake(&self) -> bool {
        self.tunnel.time_since_last_handshake().is_some()
    }
}

/// A real IPv4/UDP frame with checksums, used only as the synthetic simulation workload.
pub fn udp_frame(source: Ipv4Addr, destination: Ipv4Addr, payload: &[u8]) -> Result<Vec<u8>> {
    ensure!(
        payload.len() <= 1200,
        "simulation payload exceeds MTU budget"
    );
    let mut packet = vec![0u8; 28 + payload.len()];
    packet[0] = 0x45;
    let length = packet.len() as u16;
    packet[2..4].copy_from_slice(&length.to_be_bytes());
    packet[6] = 0x40;
    packet[8] = 64;
    packet[9] = 17;
    packet[12..16].copy_from_slice(&source.octets());
    packet[16..20].copy_from_slice(&destination.octets());
    let header_sum = checksum(&packet[..20]);
    packet[10..12].copy_from_slice(&header_sum.to_be_bytes());
    packet[20..22].copy_from_slice(&42000u16.to_be_bytes());
    packet[22..24].copy_from_slice(&42001u16.to_be_bytes());
    let udp_length = (payload.len() as u16) + 8;
    packet[24..26].copy_from_slice(&udp_length.to_be_bytes());
    packet[28..].copy_from_slice(payload);
    let mut pseudo = Vec::new();
    pseudo.extend(source.octets());
    pseudo.extend(destination.octets());
    pseudo.extend([0, 17]);
    pseudo.extend(udp_length.to_be_bytes());
    pseudo.extend(&packet[20..]);
    let sum = checksum(&pseudo);
    packet[26..28].copy_from_slice(&if sum == 0 { 65535 } else { sum }.to_be_bytes());
    Ok(packet)
}
fn checksum(bytes: &[u8]) -> u16 {
    let mut sum = 0u32;
    for chunk in bytes.chunks(2) {
        sum += u16::from_be_bytes([chunk[0], *chunk.get(1).unwrap_or(&0)]) as u32;
    }
    while sum > 65535 {
        sum = (sum & 65535) + (sum >> 16);
    }
    !(sum as u16)
}
pub fn udp_payload(packet: &[u8]) -> Result<&[u8]> {
    ensure!(
        packet.len() >= 28 && packet[0] == 0x45 && packet[9] == 17,
        "expected IPv4/UDP"
    );
    ensure!(
        u16::from_be_bytes([packet[2], packet[3]]) as usize == packet.len(),
        "IP length mismatch"
    );
    ensure!(checksum(&packet[..20]) == 0, "IP checksum mismatch");
    ensure!(
        u16::from_be_bytes([packet[24], packet[25]]) as usize == packet.len() - 20,
        "UDP length mismatch"
    );
    let mut pseudo = Vec::new();
    pseudo.extend(&packet[12..20]);
    pseudo.extend([0, 17]);
    pseudo.extend(&packet[24..26]);
    pseudo.extend(&packet[20..]);
    ensure!(checksum(&pseudo) == 0, "UDP checksum mismatch");
    Ok(&packet[28..])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frames_detect_corruption() {
        let mut frame = udp_frame(
            Ipv4Addr::new(10, 77, 0, 2),
            Ipv4Addr::new(10, 77, 0, 1),
            b"hello",
        )
        .unwrap();
        assert_eq!(udp_payload(&frame).unwrap(), b"hello");
        frame[28] ^= 1;
        assert!(udp_payload(&frame).is_err());
    }
}
