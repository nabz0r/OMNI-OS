<!-- omni:header -->
[OMNI](../README.md) / [Field guide](README.md) / Use OMNI

> **Guide** · Review selected ChatGPT, Claude or neutral JSON messages before creating proposed memories.
<!-- /omni:header -->

# Reviewed conversation imports

## Use the application

1. Open **Memory → Import text → Import chats**.
2. Choose an extracted UTF-8 JSON file, or expand **Or paste exported JSON**. ZIP/HTML archives are not parsed. Only read files you are authorised to use in the chosen work context.
3. Select one conversation. No conversation is automatically selected. User messages in that conversation are selected by default; assistant replies are not.
4. Review each message, clear unrelated material and choose **Use selected messages**. This only prepares a draft.
5. Review the role-labelled text and choose **Extract for review**. The existing capture route checks the request, calls only the configured local extractor, stores the selected source in SQLCipher and creates proposed memories. Confirm appropriate facts separately, then create a destination-scoped permission if they should be shared.

The whole export is parsed transiently on the device; only the selected draft is sent to the local core. Exports, discarded branches and unchecked messages are not submitted by this workflow. There is no account login, cookie collection, history sync, background scraping or cloud extraction fallback. Browser JavaScript memory is not a protected process boundary, and closing a dialog is not a claim of forensic memory erasure.

Capture currently extracts from at most the first 12,000 characters and creates at most five proposals. If extraction is unavailable or invalid, the existing route stores a bounded source excerpt as a proposal. Larger selected sources are retained locally but are not fully converted into memories. Repeated imports can create duplicates. This release does not add a conversation archive or deduplication service.

## Supported layouts

These are explicit parser contracts backed by synthetic fixtures, not vendor promises that export schemas will remain stable. Unknown layouts fail visibly. A provider account export must be obtained through the account's permitted mechanism; this feature does not establish export entitlement for every plan.

| Layout | Recognised fields | Selection and omissions |
| --- | --- | --- |
| ChatGPT | An object or array with `mapping`; nodes have `parent` and `message`; text uses `author.role` and `content.parts` with `content_type=text` | Follow `current_node` to the root; without it, accept only a unique leaf. Omit other branches, non-user/assistant roles, recognized hidden/non-final channels, tool recipients and non-text content |
| Claude | An object or array with `chat_messages`, `name`, `sender` and `content` text blocks or legacy `text` | `human` becomes `user`; `assistant` stays `assistant`. Prefer structured content to avoid duplicate legacy text. Other block types and attachment/file arrays are not imported |
| OMNI neutral | Explicit `format=omni-conversations-v1`, `conversations` array, `title`, `messages` with `role` and `content` | Only user/assistant strings or `type=text` blocks are retained; arbitrary nested strings are not scraped |

The omission count combines unsupported items, skipped messages and off-branch nodes; it is not a count of missing conversations or a completeness score. Files, images and tool outputs require a separate future import contract. Role/source fields can be forged in an input file, so human review remains necessary. JSON quoting preserves structural role boundaries but cannot guarantee that an extraction model ignores malicious text.

## Neutral format for other providers

Convert only an authorised source into this explicit format. This is an OMNI interchange format, not a claimed native Z.AI export schema.

Try the [synthetic example file](examples/conversation-import.synthetic.json) without using personal or customer data.

```json
{
  "format": "omni-conversations-v1",
  "conversations": [
    {
      "title": "Synthetic project constraints",
      "messages": [
        {"role": "user", "content": "Use EUR in the synthetic project examples."},
        {"role": "assistant", "content": "I will use EUR in those examples."}
      ]
    }
  ]
}
```

Neutral files display **Other** as the provider. No model/provider identity is inferred from arbitrary content. Prepared captures use chatgpt_export_review, claude_export_review or other_export_review. The final preview displays readable role-labelled text while preserving structured content for the core. **Edit as text** converts it into an editable plain-text draft and changes the source kind to manual_capture; titles remain editable. No browser URL or private account identifier is invented from a file.

## Limits and lifecycle

- At most 5,000,000 UTF-8 bytes per input; at most 1,000 conversations and 20,000 source message nodes across the file.
- At most 500 retained text messages per conversation. An individual message may not exceed 100,000 UTF-8 bytes.
- The selected capture, including its JSON labels/escaping, may not exceed 100,000 UTF-8 bytes. Policy layers may impose further restrictions.
- An invalid or oversized replacement file clears the earlier file selection. No silent truncation, bulk save or partial import occurs. Display titles are bounded to 200 JavaScript string units.
- Selecting another conversation resets the selection to that conversation's user messages. Reading another file cannot reuse a previous review approval. Closing the dialog clears its prepared draft; locking ends the application session.
- The core remains the policy and persistence authority. UI parsing does not prevent a credentialed client from using the existing raw-text capture API directly; existing authentication, validation and capture policy apply there.
- Captured source retention follows the existing vault source/memory lifecycle. Deleting one proposal does not necessarily delete a source while other memories still reference it. Destination revocation does not recall content previously received by a provider.

## Browser capture

The [extension](../apps/extension/README.md) supports ChatGPT/Claude rendered-message capture and selected-text capture. Z.AI at https://chat.z.ai supports selected text only. It does not intercept browser sends, read hidden account history or inject approved memory into those website composers.

## Verification

Run these checks from the repository root:

```bash
npm run test:imports
node --test apps/extension/adapters.test.mjs
```

The import suite covers branching, malformed trees, role handling, unsupported blocks, multilingual text and byte limits. The extension suite covers origin checks, selection-only Z.AI behavior, short replies and missing-layout failures. No test requires a provider API key or personal export.

The current change adds no route or database migration. Rust now validates the closed omni-reviewed-conversation-v1 envelope and inspects its decoded message strings in addition to the stored JSON and extractor request. This prevents JSON-escaped whitespace from hiding a match in an imported message. The envelope is recognised even when the source kind is manual_capture; declared export kinds with malformed envelopes are rejected before extraction. Ordinary arbitrary JSON-inside-strings remains outside general recursive decoding. Local extraction, proposed-memory and grant boundaries remain in force. UI and integration verification outcomes are recorded in [the implementation checks](PRO_MVP_VERIFICATION.md).

<!-- omni:footer -->
---

**Continue reading** · [Run your AI workspace](ADMINISTRATION.md) · [Set the rules before sending](POLICIES.md) · [The native workspace](../apps/desktop/README.md)

[All documentation](README.md) · [Delivery and verification](DELIVERY.md)
<!-- /omni:footer -->
