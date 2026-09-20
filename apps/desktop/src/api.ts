export const CORE = "http://127.0.0.1:3007";
export const COLLECTOR = "http://127.0.0.1:3008";
export type MemoryStatus = "proposed" | "confirmed" | "disputed" | "superseded";
export interface Memory {
  id: string;
  source_id: string;
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
  provider: { base_url: string; model: string };
  vault: { encrypted: boolean; key_storage: string };
  simulation?: boolean;
}
export interface ChatReply {
  reply: string;
  receipt_id: string | null;
  model: string;
}
export function initialToken() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (token) {
    sessionStorage.setItem("omni.token", token);
    url.searchParams.delete("token");
    history.replaceState({}, "", url);
  }
  return sessionStorage.getItem("omni.token") || "";
}
export async function request<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${CORE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const error = await response.json();
      detail =
        typeof error.error === "string" ? error.error : JSON.stringify(error);
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(
      `${response.status === 401 ? "Session token not accepted" : `Request failed (${response.status})`}${detail ? `: ${detail}` : ""}`,
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
