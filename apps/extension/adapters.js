export const SUPPORTED_HOSTS = new Set([
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
]);
export function supportedURL(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      SUPPORTED_HOSTS.has(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// Serialized by chrome.scripting into an isolated world. It receives no token.
export function captureVisibleConversation() {
  const host = location.hostname;
  if (
    location.protocol !== "https:" ||
    !["chatgpt.com", "chat.openai.com", "claude.ai"].includes(host)
  )
    return { error: "This website is not supported." };
  const selection = window.getSelection()?.toString().trim();
  if (selection && new TextEncoder().encode(selection).length > 100000)
    return {
      error:
        "The selected text exceeds 100,000 UTF-8 bytes. Select a smaller passage.",
    };
  if (selection)
    return {
      content: selection,
      title: document.title,
      url: location.origin + location.pathname,
      mode: "Selected text",
    };
  const selectors =
    host === "claude.ai"
      ? '[data-testid="user-message"], [data-is-streaming], .font-claude-message'
      : '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  const candidates = Array.from(document.querySelectorAll(selectors));
  const elements = candidates.filter(
    (el) => !candidates.some((parent) => parent !== el && parent.contains(el)),
  );
  const messages = elements
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const role =
        el.getAttribute("data-message-author-role") ||
        (el.getAttribute("data-testid") === "user-message"
          ? "user"
          : "assistant");
      return `${role}: ${el.innerText?.trim() || ""}`;
    })
    .filter((text) => text.length > 15);
  if (!messages.length)
    return {
      error:
        "No supported conversation messages found. Select the exact text you want to keep, then review again.",
    };
  const content = messages.join("\n\n");
  if (new TextEncoder().encode(content).length > 100000)
    return {
      error:
        "This conversation exceeds 100,000 UTF-8 bytes. Select a smaller passage to review.",
    };
  return {
    content,
    title: document.title,
    url: location.origin + location.pathname,
    mode: "Rendered conversation messages",
  };
}
