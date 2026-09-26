import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { supportedURL, captureVisibleConversation } from "./adapters.js";
test("capture restricts exact HTTPS provider origins", () => {
  assert.equal(supportedURL("https://chatgpt.com/c/123"), true);
  assert.equal(supportedURL("https://claude.ai/chat/123"), true);
  assert.equal(supportedURL("https://chat.z.ai/c/123"), true);
  for (const url of [
    "https://chatgpt.com.evil.test",
    "http://chatgpt.com",
    "https://user:pass@evil.test/chatgpt.com",
    "file:///chatgpt.com",
    "https://claude.ai.evil.test",
    "https://chatgpt.com:4444",
    "https://user:pass@chatgpt.com",
    "invalid",
    "https://chat.z.ai.evil.test",
    "https://z.ai",
    "https://chat.z.ai:4444",
  ])
    assert.equal(supportedURL(url), false, url);
});

const capture = (url, selection = "", elements = []) => {
  let queried = false;
  const result = runInNewContext(
    `(${captureVisibleConversation.toString()})()`,
    {
      URL,
      TextEncoder,
      location: { href: url },
      window: { getSelection: () => ({ toString: () => selection }) },
      document: {
        title: "Synthetic conversation",
        querySelectorAll: () => {
          queried = true;
          return elements;
        },
      },
    },
  );
  return { result, queried };
};
test("Z.AI supports explicit selection without guessing page structure or leaking query data", () => {
  const { result, queried } = capture(
    "https://chat.z.ai/c/test?private=omit#fragment",
    "Reviewed synthetic text",
  );
  assert.equal(result.content, "Reviewed synthetic text");
  assert.equal(result.url, "https://chat.z.ai/c/test");
  assert.equal(queried, false);
  assert.match(capture("https://chat.z.ai").result.error, /Select the exact/);
});
test("the injected function revalidates origin after a tab navigation", () => {
  for (const url of [
    "http://chatgpt.com",
    "https://claude.ai:4444",
    "https://user:pass@chat.z.ai",
    "https://evil.test",
  ])
    assert.match(capture(url, "Synthetic").result.error, /not supported/);
});
test("rendered short answers are retained and hidden or empty elements are omitted", () => {
  const element = (role, text, visible = true) => ({
    getAttribute: (name) => (name === "data-message-author-role" ? role : null),
    getClientRects: () => (visible ? [1] : []),
    contains: () => false,
    innerText: text,
  });
  const { result } = capture("https://chatgpt.com/c/test", "", [
    element("user", "No"),
    element("assistant", "OK"),
    element("user", ""),
    element("user", "Hidden", false),
  ]);
  assert.equal(result.content, "user: No\n\nassistant: OK");
});
test("unknown layouts and oversized UTF-8 selections fail explicitly", () => {
  assert.match(
    capture("https://claude.ai/chat/test").result.error,
    /No supported/,
  );
  assert.match(
    capture("https://chat.z.ai", "€".repeat(34_000)).result.error,
    /exceeds/,
  );
});
