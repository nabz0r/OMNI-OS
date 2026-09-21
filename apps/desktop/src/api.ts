import { nativeRequest, nativeSession, type NativeSession } from "./native";
export let CORE = "http://127.0.0.1:3007";
export let COLLECTOR: string | null = "http://127.0.0.1:3008";
export function configureRuntime(session: NativeSession | null) {
  if (session) {
    CORE = session.core_url;
    COLLECTOR = session.collector_url;
  }
}
export type MemoryStatus = "proposed" | "confirmed" | "disputed" | "superseded";
export interface Memory {
  id: string;
  source_id: string;
  source: string;
  content: string;
  status: MemoryStatus;
  created_at: string;
  updated_at: string;
}
export interface Grant {
  id: string;
  destination: string;
  scope: string[];
  expires_at: string;
  revoked_at: string | null;
}
export interface Receipt {
  id: string;
  destination: string;
  memory_ids: string[];
  created_at: string;
  status: "authorized" | "sent" | "send_failed_or_partial";
}
export interface CoreState {
  memories: Memory[];
  grants: Grant[];
  receipts: Receipt[];
  stats: {
    interactions: number;
    memories: number;
    active_grants: number;
    disclosures: number;
    simulation?: boolean;
  };
  analytics: {
    opt_in: boolean;
    budget_used: number;
    budget_limit: number;
    reports: number;
  };
  provider: {
    id?: string;
    kind?: string;
    base_url: string;
    model: string;
    local: boolean;
  };
  vault: { encrypted: boolean; key_storage: string };
  simulation?: boolean;
}
export interface ChatReply {
  provider_id?: string;
  reply: string;
  receipt_id: string | null;
  model: string;
}
export function initialToken() {
  const url = new URL(window.location.href);
  // Legacy query credentials are discarded, never adopted as an owner session.
  if (url.searchParams.has("token")) {
    url.searchParams.delete("token");
    history.replaceState({}, "", url);
  }
  return sessionStorage.getItem("omni.token") || "";
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response =
      nativeSession?.mode === "embedded"
        ? await nativeRequest(token, path, options)
        : await fetch(`${CORE}${path}`, {
            ...options,
            headers: {
              Authorization: `Bearer ${token}`,
              ...(options.body ? { "Content-Type": "application/json" } : {}),
              ...options.headers,
            },
            signal: options.signal ?? AbortSignal.timeout(90000),
          });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError(
        "The request timed out. Check History before retrying; it may already have reached its destination.",
        0,
      );
    }
    if (nativeSession?.mode === "embedded" && error instanceof Error)
      throw new ApiError(error.message, 0);
    throw new ApiError(
      "Cannot reach your local OMNI service. Start OMNI, then try again.",
      0,
    );
  }
  if (!response.ok) {
    const body = await response.text();
    let detail = body.slice(0, 500);
    try {
      const error = JSON.parse(body);
      detail =
        typeof error.error === "string"
          ? error.error
          : typeof error.error?.message === "string"
            ? error.error.message
            : JSON.stringify(error);
    } catch {
      /* Plain-text errors remain readable. */
    }
    throw new ApiError(
      `${response.status === 401 ? "Session token not accepted" : `Request failed (${response.status})`}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function isActive(grant: Grant) {
  return !grant.revoked_at && Date.parse(grant.expires_at) > Date.now();
}
export function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
