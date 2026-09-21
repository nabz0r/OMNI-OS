use crate::{Error, Result};

pub(crate) fn decode_key(bytes: &[u8]) -> Result<[u8; 32]> {
    bytes.try_into().map_err(|_| Error::InvalidKey)
}

#[cfg(desktop)]
pub(crate) trait KeyStore {
    fn read(&self) -> Result<Option<Vec<u8>>>;
    fn write(&self, value: &[u8; 32]) -> Result<()>;
}

#[cfg(desktop)]
pub(crate) fn load_or_create(
    store: &impl KeyStore,
    vault_exists: bool,
    generate: impl FnOnce(&mut [u8; 32]) -> Result<()>,
) -> Result<[u8; 32]> {
    use zeroize::Zeroizing;
    match store.read()? {
        Some(bytes) => decode_key(&Zeroizing::new(bytes)),
        None if vault_exists => Err(Error::MissingKey),
        None => {
            let mut key = Zeroizing::new([0u8; 32]);
            generate(&mut key)?;
            store.write(&key)?;
            let saved = Zeroizing::new(store.read()?.ok_or(Error::KeyPersistence)?);
            if saved.as_slice() != key.as_slice() {
                return Err(Error::KeyPersistence);
            }
            Ok(*key)
        }
    }
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    #[derive(Default)]
    struct Store {
        key: RefCell<Option<Vec<u8>>>,
        writes: Cell<usize>,
        unavailable: bool,
        discard_write: bool,
    }

    impl KeyStore for Store {
        fn read(&self) -> Result<Option<Vec<u8>>> {
            if self.unavailable {
                Err(Error::SecureStoreUnavailable)
            } else {
                Ok(self.key.borrow().clone())
            }
        }
        fn write(&self, value: &[u8; 32]) -> Result<()> {
            self.writes.set(self.writes.get() + 1);
            if !self.discard_write {
                self.key.replace(Some(value.to_vec()));
            }
            Ok(())
        }
    }

    #[test]
    fn new_key_is_persisted_and_reused_without_generation() {
        let store = Store::default();
        let first = load_or_create(&store, false, |key| {
            key.fill(42);
            Ok(())
        })
        .unwrap();
        let second = load_or_create(&store, true, |_| panic!("must reuse saved key")).unwrap();
        assert_eq!(first, second);
        assert_eq!(store.writes.get(), 1);
    }

    #[test]
    fn missing_key_with_existing_vault_never_generates_or_writes() {
        let store = Store::default();
        assert_eq!(
            load_or_create(&store, true, |_| panic!("must not replace")),
            Err(Error::MissingKey)
        );
        assert_eq!(store.writes.get(), 0);
    }

    #[test]
    fn malformed_existing_key_is_never_replaced_even_for_new_vault() {
        for length in [0, 1, 31, 33, 64] {
            let store = Store {
                key: RefCell::new(Some(vec![13; length])),
                ..Store::default()
            };
            assert_eq!(
                load_or_create(&store, false, |_| panic!("must not replace")),
                Err(Error::InvalidKey)
            );
            assert_eq!(store.writes.get(), 0);
        }
    }

    #[test]
    fn inaccessible_store_does_not_fall_back_or_generate() {
        let store = Store {
            unavailable: true,
            ..Store::default()
        };
        assert_eq!(
            load_or_create(&store, false, |_| panic!("must fail closed")),
            Err(Error::SecureStoreUnavailable)
        );
        assert_eq!(store.writes.get(), 0);
    }

    #[test]
    fn failed_random_generation_never_persists() {
        let store = Store::default();
        assert_eq!(
            load_or_create(&store, false, |_| Err(Error::RandomUnavailable)),
            Err(Error::RandomUnavailable)
        );
        assert_eq!(store.writes.get(), 0);
    }

    #[test]
    fn successful_write_without_durable_readback_is_rejected() {
        let store = Store {
            discard_write: true,
            ..Store::default()
        };
        assert_eq!(
            load_or_create(&store, false, |key| {
                key.fill(1);
                Ok(())
            }),
            Err(Error::KeyPersistence)
        );
    }
}
