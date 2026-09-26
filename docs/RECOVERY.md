<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Use OMNI

> **Guide + recovery contract** · Encrypted recovery, empty-installation restore and explicit capacity limits.
<!-- /omni:header -->

# Recover an installation without reviving access

OMNI 0.4.0 adds a **passphrase-encrypted logical archive**, exported and restored from Work. It is a bounded evaluation recovery mechanism, not continuous backup, device synchronisation or a guarantee that an untested disaster scenario will succeed.

## Export and keep the passphrase separately

Choose a long, unique recovery passphrase of 16–1,024 UTF-8 bytes and repeat it in Work. Export writes an encrypted JSON archive through the same native save/share mechanism used for metadata exports. On macOS, the file goes to Documents/OMNI. Android opens the system share sheet; choose your own authorised destination. Browser development uses a download. No archive is uploaded automatically.

The archive includes memories and sources, edit history, grants and receipts, operational journals, policy decisions and local rules, saved conversations, analytics records and provider settings **including provider API credentials**. Treat the archive and passphrase as sensitive. The archive excludes reusable approved-client credentials, client/grant bindings, the device's vault key, native owner-session tokens and the platform wrapping key. An administrator's managed policy remains external to the archive.

Export fails rather than truncates above 400,000 bytes of serialized plaintext or 10,000 records. The encrypted hex envelope must fit the local API body limit. Review this capacity before a pilot with substantial history. Old exports do not expire when a conversation is deleted from the active vault.

## Restore on an unused installation

1. Install the matching evaluation version on a dedicated device or OS user. Do not enroll it, create memories, send model requests or change settings before restoring; those actions make it a used installation.
2. Open Work, select the archive and enter its passphrase. Acknowledge that restored permissions require approval again.
3. OMNI verifies the archive and restores it atomically into the destination's newly encrypted vault. Existing work is never overwritten.
4. Review the recovered providers, policies, memories and conversation roles. The destination's managed baseline and upstream restrictions still apply. Analytics is off.
5. Create new named client approvals and new grants. Every restored grant is revoked, and no old client token authenticates. Existing saved conversations bound to a revoked grant remain readable but cannot continue; create a new scoped conversation for new access.
6. Record a synthetic restore drill before relying on an archive for actual work. Keep a tested older package and its matching signing identity for update planning. A source build or a copied database alone is not a recovery drill.

The destination keeps its own installation ID and platform key. Pending conversations become non-pending at a new revision, so old in-flight responses cannot attach to the recovered state. Restored analytics reports and their ledger remain present, but cross-device clones and rollback can invalidate a global privacy-budget assumption; restoration does not provide cross-device accounting.

A lost passphrase has no reset mechanism. Losing a device before making a usable archive can still lose its vault. No plaintext key-export flow or cross-device OS-key transfer is introduced.

## Construction and validation

The versioned envelope uses AES-256-GCM with a random 96-bit nonce and fixed format identifier as authenticated associated data. A random 128-bit salt feeds Argon2id v19 with 64 MiB, three iterations, one lane and a 256-bit output. Fixed accepted parameters bound KDF work; at most one recovery operation runs at a time on a blocking worker. Key material and serialized plaintext buffers use zeroizing wrappers. This does not claim that every deserialized value or every runtime copy is erased from RAM.

The implementation uses [RustCrypto AES-GCM](https://docs.rs/aes-gcm/0.10.3/aes_gcm/) and [Argon2](https://docs.rs/argon2/0.5.3/argon2/). These primitives and their documentation do not constitute an independent review of OMNI's archive format or user workflow.

Archive contents never provide executable SQL. Restoration uses an explicit table/column allowlist and bound values, validates foreign keys and compiles restored local policy before commit. Invalid data rolls back. A wrong passphrase or modified ciphertext restores nothing. Unknown table schemas refuse export rather than silently omit data.

Core tests cover changed device key and identity, restored human/model roles, revoked permissions, absent client credentials, wrong passwords, ciphertext modification, excessive KDF parameters, size rejection, used-vault refusal and rollback after invalid rows. See [current evidence](WORK_VERIFICATION.md) for the exact tested build and remaining device work.

| Endpoint | Owner request |
| --- | --- |
| `POST /api/recovery/export` | `{ "passphrase": "a separately stored long passphrase" }` |
| `POST /api/recovery/restore` | `passphrase`, the complete `archive` object, `acknowledge_revoked_access: true` |

Metadata-only History/Usage exports remain separate and are **not** recovery archives. Recovery is opt-in and includes substantially more sensitive content.

<!-- omni:footer -->
---

**Continue reading** · [Bring your context](CONVERSATION_IMPORT.md) · [Run your AI workspace](ADMINISTRATION.md) · [Set the rules before sending](POLICIES.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
