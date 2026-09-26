export interface NativeSession {
  token: string;
  mode: "embedded" | "external";
  core_url: string;
  collector_url: string | null;
  platform: string;
}
export const isNative = "__TAURI_INTERNALS__" in window;
export let nativeSession: NativeSession | null = null;
export const isMobileDevice = () =>
  nativeSession?.platform === "ios" || nativeSession?.platform === "android";

export async function saveMetadata(
  name: string,
  contents: string,
  mime: string,
): Promise<string> {
  if (isNative) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("save_metadata", { name, contents, mime });
  }
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "Download prepared.";
}

export async function provisionNativeSession(): Promise<NativeSession | null> {
  if (!isNative) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const value = await invoke<NativeSession>("native_session");
  nativeSession = value;
  return value;
}

// Cancelling a native wait does not claim to recall an upstream request. The
// Rust gateway still records its eventual outcome for deliberate retry review.
export async function nativeRequest(
  token: string,
  path: string,
  options: RequestInit,
): Promise<Response> {
  const { invoke } = await import("@tauri-apps/api/core");
  if (options.body != null && typeof options.body !== "string")
    throw new Error("This local request requires a JSON body.");
  const signal = options.signal ?? AbortSignal.timeout(90000);
  signal.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    void invoke<{ status: number; body: string }>("core_request", {
      token,
      method: options.method ?? "GET",
      path,
      body: options.body ?? null,
    }).then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        if (!signal.aborted)
          resolve(
            new Response(value.status === 204 ? null : value.body, {
              status: value.status,
              headers: { "Content-Type": "application/json" },
            }),
          );
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        if (!signal.aborted)
          reject(
            new Error(
              typeof error === "string"
                ? error
                : "The local request could not finish.",
            ),
          );
      },
    );
  });
}

export function vaultStorageLabel(value: string) {
  const labels: Record<string, string> = {
    keychain: "OS Keychain",
    "macos-keychain": "macOS Keychain",
    "ios-keychain": "iOS Keychain",
    "windows-credential-manager": "Windows Credential Manager",
    "linux-secret-service": "System Secret Service",
    "android-keystore": "Android Keystore",
    "development-file": "Development key file",
    file: "Development key file",
  };
  return labels[value] ?? "System key store";
}

export async function nativeGateway(
  enabled?: boolean,
): Promise<{ enabled: boolean; address: string | null }> {
  if (!nativeSession || nativeSession.mode !== "embedded")
    throw new Error("This session uses the external gateway.");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("client_gateway", {
    token: nativeSession.token,
    enabled: enabled ?? null,
  });
}
