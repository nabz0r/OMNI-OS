<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Start

> **Guide** · Quick answers about privacy, providers, imports, updates and the VPN.
<!-- /omni:header -->

# Questions, answered precisely

## Does everything stay on my device?

Your vault and local operational records stay in your installation. When you send to a remote model, that provider receives the request and the context you authorize. Fully local inference requires a local model service. Optional analytics uses a separate numeric-report protocol; the standalone native app has no collector configured. [Privacy](PRIVACY.md).

## Does OMNI read all my ChatGPT, Claude or Z.AI chats?

No. You can supply a supported JSON export and review selected messages. The separate extension captures supported visible or selected text after an explicit action; Z.AI supports selection only. Neither route silently signs in, synchronizes an account or intercepts every send. [Conversation import](CONVERSATION_IMPORT.md).

## Can the VPN decrypt another app's HTTPS traffic?

No. The optional WireGuard path protects transport. Content-aware checks require a supported application path through OMNI. A general TLS interception deployment would be a different architecture with separate trust and validation requirements. [Professional scope](PRO_MVP.md).

## Why does the extension not connect to my installed native app?

The standalone native application has no HTTP listener by default. The extension expects an explicitly running, authenticated loopback core on port 3007. Native browser pairing is not implemented. Use file import inside the native application, or configure the documented external gateway mode. [Integrations](INTEGRATIONS.md).

## Is my ChatGPT or Claude subscription enough to connect a model?

A website subscription is not an API credential. Use an authorized provider API account and compatible model, or an existing local model service. OMNI does not bundle model weights, subscriptions or provider credits. [Getting started](GETTING_STARTED.md).

## What happens when the local extractor is unavailable?

Capture retains the selected source in the encrypted vault and proposes a bounded excerpt for review. It does not switch extraction to a cloud model. The current extraction path considers at most 12,000 characters and creates at most five proposals; repeated imports may create duplicates. [Limits and lifecycle](CONVERSATION_IMPORT.md#limits-and-lifecycle).

## Does importing a conversation share it with my models?

Import creates proposed memories. Confirm useful facts separately and create a destination-scoped permission before using them as vault context. Assistant replies are unchecked by default. Preparing a review does not itself persist a memory or grant access. [Import workflow](CONVERSATION_IMPORT.md#use-the-application).

## Does Work save every conversation automatically?

No. The launcher stays transient. A separate Work conversation needs explicit consent, a project label, a fixed provider/model/permission and a retention deadline. It stores human statements separately from model suggestions and selects at most 10 pairs/40,000 bytes after authorisation. Review and delete it in Work. [Continuity contract](WORK.md).

## Can a whole team share one installation token?

No. Use dedicated installations for individual OS users and approve each client separately. Work disables the legacy integration token. The current product has no shared tenant service, SSO or internal work/personal partition. [Professional authority](WORK.md).

## Can revocation take back a provider's copy?

Revocation blocks future authorized sharing through OMNI. It cannot retrieve content already received by a provider. Deleting local data is not a promise of remote deletion. [Disclosure and deletion](PRIVACY.md#deletion).

## Does locking the interface lock the operating system or erase the key?

No. It clears transient interface state and requires an explicit reopen action. The core can remain running and work already dispatched may continue. Protect the OS account and device separately. [Security boundary](SECURITY.md).

## Can I copy my vault to another device as a backup?

A database copy alone is not a recoverable backup without its original usable key. Mobile keys can be device-bound. Work offers a bounded passphrase-encrypted archive and restoration to an unused installation with revoked permissions. Cross-device synchronization and a full physical-device loss drill are not implied. [Recovery](RECOVERY.md). Do not delete a vault or key to resolve an update problem. [Operations](OPERATIONS.md).

## Are these production-signed applications?

The evaluation Mac package is ad-hoc signed and not notarized. The Android package uses a development certificate. Its acceptance evidence comes from an emulator. The local delivery passed its documented checks; production identity, physical-device coverage and independently reviewed recovery drills remain release work. [Delivery and evidence](DELIVERY.md).

## What do the token and cost figures prove?

Usage shows reported counters and explicit estimates. Unknown counters stay unknown. Manual prices and incomplete observations are not invoices. Comparing source size with inserted context does not establish better answers, internet bandwidth savings or a measured productivity gain. [Administration](ADMINISTRATION.md).

<!-- omni:footer -->
---

**Continue reading** · [Your context. Your authority.](../README.md) · [The OMNI field guide](README.md) · [Your first useful conversation](GETTING_STARTED.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
