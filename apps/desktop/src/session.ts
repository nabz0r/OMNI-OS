import { CORE } from "./api";

// A fragment is never included in the HTTP request for the page. Remove it
// synchronously, before rendering, and exchange it exactly once per page load.
const location = new URL(window.location.href);
const fragment = new URLSearchParams(location.hash.slice(1));
let secret = fragment.get("connect");
const offered = secret !== null;
const legacyQuery = location.searchParams.has("token");
location.searchParams.delete("token");
if (offered) {
  sessionStorage.removeItem("omni.token");
  fragment.delete("connect");
  location.hash = fragment.toString();
}
if (offered || legacyQuery) history.replaceState({}, "", location);
let pending: Promise<string> | null = null;
let consumed = false;

export function hasLaunchSession() {
  return offered && !consumed;
}

export function claimLaunchSession(): Promise<string> {
  if (pending) return pending;
  if (consumed || !secret || !/^[a-f0-9]{64}$/i.test(secret)) {
    consumed = true;
    secret = null;
    return Promise.reject(
      new Error(
        "This private launch link is invalid. Use your local session token to unlock.",
      ),
    );
  }
  const body = JSON.stringify({ secret });
  secret = null;
  consumed = true;
  // Keep the pending exchange through React's development effect replay. A
  // second claim would consume the one-time link twice; unmount never retries it.
  pending = fetch(`${CORE}/api/session/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "omit",
    body,
    signal: AbortSignal.timeout(10000),
  })
    .then(async (response) => {
      if (!response.ok)
        throw new Error(
          "This private launch link expired or was already used. Unlock with your local session token, or restart OMNI for a new link.",
        );
      const value = await response.json();
      if (typeof value.token !== "string" || !value.token)
        throw new Error(
          "The local service could not open this session. Use your local session token to retry.",
        );
      return value.token;
    })
    .catch((error: unknown) => {
      if (
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === "TimeoutError")
      )
        throw new Error(
          "Your local service did not respond. Check that OMNI is running, then unlock with your local session token.",
        );
      throw error;
    });
  return pending;
}

export function forgetLaunchSession() {
  consumed = true;
  secret = null;
  pending = null;
}
