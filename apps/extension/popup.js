import { supportedURL, captureVisibleConversation } from "./adapters.js";
const $ = (id) => document.getElementById(id);
const CORE = "http://127.0.0.1:3007";
let token = "";
let current = null;
let busy = false;
const status = (text, success = false) => {
  $("status").textContent = text;
  $("status").className = success ? "success" : "";
};
const ready = () => {
  $("connection").hidden = !!token;
  $("capture").hidden = !token;
  $("save").disabled =
    busy || !current || !$("preview").value.trim() || !$("approve").checked;
};
const api = async (path, body) => {
  const response = await fetch(CORE + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(body ? 65000 : 10000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail =
        typeof data.error === "string" ? data.error : JSON.stringify(data);
    } catch {}
    throw new Error(
      `Local core returned ${response.status}${detail ? `: ${detail}` : ""}.`,
    );
  }
  return response.json();
};
$("origin").textContent =
  `OMNI_EXTENSION_ORIGIN=chrome-extension://${chrome.runtime.id}`;
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
const stored = await chrome.storage.session.get("omniToken");
token = stored.omniToken || "";
ready();
$("connect").addEventListener("click", async () => {
  if (busy) return;
  token = $("token").value.trim();
  if (!token) {
    status("Enter the agent token printed by run.sh.");
    return;
  }
  busy = true;
  $("connect").disabled = true;
  try {
    await api("/api/capture/status");
    await chrome.storage.session.set({ omniToken: token });
    $("token").value = "";
    status("Connected. Review a conversation before saving.", true);
  } catch (error) {
    token = "";
    status(
      `${error.message} Check that the core is running and the extension origin is configured.`,
    );
  } finally {
    busy = false;
    $("connect").disabled = false;
    ready();
  }
});
$("lock").addEventListener("click", async () => {
  await chrome.storage.session.remove("omniToken");
  token = "";
  current = null;
  $("preview").value = "";
  $("approve").checked = false;
  status("Session locked.");
  ready();
});
$("read").addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  $("read").disabled = true;
  $("approve").checked = false;
  current = null;
  ready();
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id || !supportedURL(tab.url))
      throw new Error("Open a ChatGPT or Claude conversation tab first.");
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureVisibleConversation,
    });
    const result = results[0]?.result;
    if (!result || result.error)
      throw new Error(result?.error || "This conversation could not be read.");
    current = result;
    $("preview").value = result.content;
    $("source").textContent =
      `${result.mode} · ${new URL(result.url).hostname}`;
    $("characters").textContent =
      `${result.content.length.toLocaleString()} characters`;
    status("Review and edit the text. Nothing has been saved yet.");
  } catch (error) {
    $("preview").value = "";
    status(error.message);
  } finally {
    busy = false;
    $("read").disabled = false;
    ready();
  }
});
$("preview").addEventListener("input", () => {
  $("approve").checked = false;
  $("characters").textContent =
    `${$("preview").value.length.toLocaleString()} characters`;
  ready();
});
$("approve").addEventListener("change", ready);
$("save").addEventListener("click", async () => {
  if (busy || !current || !$("approve").checked) return;
  const content = $("preview").value.trim();
  if (!content || new TextEncoder().encode(content).length > 100000) {
    status("Choose between 1 and 100,000 UTF-8 bytes.");
    return;
  }
  busy = true;
  ready();
  try {
    const response = await api("/api/capture", {
      content,
      source: "browser",
      title: current.title,
      url: current.url,
    });
    status(
      `Saved locally. ${response.memories?.length ?? 0} items are ready for review.${response.extraction?.includes("unavailable") ? " Local model unavailable: a source excerpt was saved instead of inferred memories." : ""}`,
      true,
    );
    current = null;
    $("preview").value = "";
    $("approve").checked = false;
    $("characters").textContent = "0 characters";
  } catch (error) {
    status(error.message);
  } finally {
    busy = false;
    ready();
  }
});
