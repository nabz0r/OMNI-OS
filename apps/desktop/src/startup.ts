// Startup acknowledgement reports only a fixed phase. It never exports vault data.
export function withinDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            "Opening the local vault is taking longer than expected. Unlock your device and try again.",
          ),
        ),
      milliseconds,
    );
    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function reportStartup(phase: "interface" | "ready" | "recovery") {
  window.dispatchEvent(new Event("omni:interface-visible"));
  if (!("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("startup_report", { phase }))
    .catch(() => {
      // Failure leaves the native watchdog active and the release check unpassed.
    });
}
