use anyhow::{ensure, Result};
use boringtun::x25519::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

pub const ROTATION_SECONDS: u64 = 1800;
pub const OVERLAP_SECONDS: u64 = 30;

/// Static client identity rotation, distinct from WireGuard's automatic session rekeys.
pub struct KeyEpoch {
    pub epoch: u64,
    pub private: Zeroizing<[u8; 32]>,
    pub public: [u8; 32],
}
impl KeyEpoch {
    pub fn fresh(epoch: u64) -> Self {
        let private = Zeroizing::new(crate::random_key());
        let public = PublicKey::from(&StaticSecret::from(*private)).to_bytes();
        Self {
            epoch,
            private,
            public,
        }
    }
}

pub struct Rotation {
    pub active: KeyEpoch,
    pub pending: Option<KeyEpoch>,
    pub retired: Option<(KeyEpoch, u64)>,
    next_at: u64,
    interval: u64,
}
impl Rotation {
    pub fn new(now: u64) -> Self {
        Self::with_interval(now, ROTATION_SECONDS)
    }
    pub fn with_interval(now: u64, interval: u64) -> Self {
        Self {
            active: KeyEpoch::fresh(0),
            pending: None,
            retired: None,
            next_at: now.saturating_add(interval.max(1)),
            interval: interval.max(1),
        }
    }
    pub fn due(&self, now: u64) -> bool {
        now >= self.next_at && self.pending.is_none()
    }
    pub fn prepare(&mut self, now: u64) -> Result<&KeyEpoch> {
        self.expire(now);
        ensure!(self.due(now), "rotation not due or already pending");
        ensure!(self.retired.is_none(), "previous overlap still active");
        self.pending = Some(KeyEpoch::fresh(
            self.active
                .epoch
                .checked_add(1)
                .ok_or_else(|| anyhow::anyhow!("epoch overflow"))?,
        ));
        Ok(self.pending.as_ref().expect("inserted"))
    }
    /// Call only after authenticated preparation ACK and a successful handshake on the new path.
    pub fn acknowledge(&mut self, epoch: u64, public: &[u8; 32], now: u64) -> Result<()> {
        let pending = self
            .pending
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("no pending rotation"))?;
        ensure!(
            pending.epoch == epoch && &pending.public == public,
            "rotation acknowledgement mismatch"
        );
        let replacement = self.pending.take().expect("checked");
        let previous = std::mem::replace(&mut self.active, replacement);
        self.retired = Some((previous, now.saturating_add(OVERLAP_SECONDS)));
        self.next_at = now.saturating_add(self.interval);
        Ok(())
    }
    pub fn expire(&mut self, now: u64) {
        if self
            .retired
            .as_ref()
            .is_some_and(|(_, expiry)| now >= *expiry)
        {
            self.retired = None;
        }
    }
    pub fn cancel_pending(&mut self) {
        self.pending = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rotation_requires_matching_ack_and_expires_overlap() {
        let mut state = Rotation::new(0);
        assert!(!state.due(1799));
        assert!(state.due(1800));
        let previous = state.active.public;
        let next = state.prepare(1800).unwrap().public;
        assert_ne!(previous, next);
        assert!(state.acknowledge(1, &[0; 32], 1800).is_err());
        assert_eq!(state.active.public, previous);
        state.acknowledge(1, &next, 1800).unwrap();
        assert!(state.retired.is_some());
        state.expire(1830);
        assert!(state.retired.is_none());
        assert!(!state.due(3599));
        assert!(state.due(3600));
    }
}
