import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import RecoveryBoundary from "./RecoveryBoundary";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RecoveryBoundary>
      <App />
    </RecoveryBoundary>
  </React.StrictMode>,
);
