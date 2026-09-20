import test from "node:test";
import assert from "node:assert/strict";
import { supportedURL } from "./adapters.js";
test("capture restricts exact HTTPS provider origins", () => {
  assert.equal(supportedURL("https://chatgpt.com/c/123"), true);
  assert.equal(supportedURL("https://claude.ai/chat/123"), true);
  for (const url of [
    "https://chatgpt.com.evil.test",
    "http://chatgpt.com",
    "https://user:pass@evil.test/chatgpt.com",
    "file:///chatgpt.com",
    "https://claude.ai.evil.test",
    "https://chatgpt.com:4444",
    "https://user:pass@chatgpt.com",
    "invalid",
  ])
    assert.equal(supportedURL(url), false, url);
});
