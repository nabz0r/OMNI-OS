# Explicit browser capture

Load this folder as an unpacked Manifest V3 extension in Chrome or a compatible browser. The popup displays its `OMNI_EXTENSION_ORIGIN=chrome-extension://<id>` value. Configure that exact origin before starting the local core, then enter the scoped agent token in the popup.

On an HTTPS ChatGPT (`chatgpt.com` / `chat.openai.com`) or Claude (`claude.ai`) conversation, open the popup and choose **Review current conversation**. If you selected text on the page, only that selection is proposed; otherwise the adapter reads rendered conversation message elements. Edit the preview, confirm the explicit local-save checkbox, then choose **Save reviewed text**. Any edit clears the confirmation checkbox.

The extension uses `activeTab` and `scripting` only after this user action. There are no continuously installed content scripts, background scraping, page listeners, or global keystroke recording. The scoped agent token is stored in trusted-only `chrome.storage.session`, never passed into the website or injected capture function. Content is sent only to authenticated `http://127.0.0.1:3007/api/capture`. The core proposes memories for review; capture does not grant model access.

Adapters depend on provider page structure. Unknown layouts fail visibly; they never fall back to scraping the whole page. The maximum reviewed payload is 100,000 UTF-8 bytes. The extension captures only rendered messages, not a guaranteed complete provider history. Selection capture is the explicit fallback when page structure changes.

Run `node --test apps/extension/adapters.test.mjs` from the repository root for exact-origin matching tests.

The extension captures nothing in the background. You choose the conversation, review the text, and authorize saving it to your local vault. This action does not send the content to a remote model provider; a bounded excerpt is processed by the configured local extraction model.
