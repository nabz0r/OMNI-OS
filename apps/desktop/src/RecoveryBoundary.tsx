import { Component, type ReactNode } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default class RecoveryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-page">
        <div className="recovery-symbol">
          <ShieldCheck size={32} />
        </div>
        <div className="eyebrow">LET'S GET YOU BACK</div>
        <h1>Your space is still here.</h1>
        <p>
          The interface could not finish loading. Reload to reconnect to your
          local vault. Unsaved drafts may need to be entered again.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload OMNI <ArrowRight size={17} />
        </button>
        <span>Reloading does not delete saved memories or permissions.</span>
      </main>
    );
  }
}
