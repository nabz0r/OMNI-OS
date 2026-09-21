import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import RecoveryBoundary from "./RecoveryBoundary";
import { configureRuntime } from "./api";
import { isNative, provisionNativeSession } from "./native";
import "./styles.css";

const viewport = () => {
  const visual = window.visualViewport;
  document.documentElement.style.setProperty(
    "--omni-viewport-height",
    `${visual?.height ?? innerHeight}px`,
  );
  document.documentElement.style.setProperty(
    "--omni-viewport-top",
    `${visual?.offsetTop ?? 0}px`,
  );
};
viewport();
window.visualViewport?.addEventListener("resize", viewport);
window.visualViewport?.addEventListener("scroll", viewport);
window.addEventListener("resize", viewport);

const root = ReactDOM.createRoot(document.getElementById("root")!);
async function start() {
  if (isNative)
    root.render(
      <main className="recovery-page" role="status">
        <div className="eyebrow">YOUR PERSONAL SPACE</div>
        <h1>Opening your local vault…</h1>
        <p>Your device keeps your memory and its encryption key.</p>
      </main>,
    );
  try {
    const session = await provisionNativeSession();
    configureRuntime(session);
    if (session) {
      document.documentElement.dataset.platform = session.platform;
      if (
        ["android", "ios"].includes(session.platform) &&
        localStorage.getItem("omni.green") === null
      )
        localStorage.setItem("omni.green", "true");
      if (sessionStorage.getItem("omni.locked") !== "true")
        sessionStorage.setItem("omni.token", session.token);
      else sessionStorage.removeItem("omni.token");
    }
    root.render(
      <React.StrictMode>
        <RecoveryBoundary>
          <App />
        </RecoveryBoundary>
      </React.StrictMode>,
    );
  } catch (error) {
    root.render(
      <main className="recovery-page">
        <div className="eyebrow">LET'S GET YOU CONNECTED</div>
        <h1>Your vault needs attention.</h1>
        <p role="alert">
          {typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : "The system key store is unavailable. Unlock your device and try again."}
        </p>
        <button className="primary" onClick={() => void start()}>
          Try again
        </button>
        <span>Existing memories have not been deleted or replaced.</span>
      </main>,
    );
  }
}
void start();
