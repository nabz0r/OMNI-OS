import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  Command,
  Database,
  Eye,
  Fingerprint,
  Globe2,
  KeyRound,
  Leaf,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Nebula from "./Nebula";
import {
  COLLECTOR,
  dateLabel,
  initialToken,
  isActive,
  request,
  type ChatReply,
  type CoreState,
  type Memory,
  type MemoryStatus,
} from "./api";

type View =
  | "overview"
  | "memories"
  | "permissions"
  | "activity"
  | "network"
  | "collective";
const nav = [
  { id: "overview" as View, label: "Overview", icon: CircleDot },
  { id: "memories" as View, label: "Memory", icon: Database },
  { id: "permissions" as View, label: "Permissions", icon: ShieldCheck },
  { id: "activity" as View, label: "Activity", icon: Activity },
  { id: "network" as View, label: "Connections", icon: Network },
  { id: "collective" as View, label: "Collective", icon: Globe2 },
];
type GlobalData = Record<string, unknown>;
const formatCount = (n: number) => new Intl.NumberFormat("en").format(n);

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <CircleDot size={27} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <img src="/omni.svg" alt="" />
      <span>
        omni<span className="brand-period">.</span>
      </span>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(initialToken);
  const [draftToken, setDraftToken] = useState("");
  const [core, setCore] = useState<CoreState | null>(null);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<
    "connecting" | "online" | "offline"
  >("connecting");
  const [green, setGreen] = useState(
    () => localStorage.getItem("omni.green") === "true",
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Memory | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newMemory, setNewMemory] = useState(false);
  const [memoryContent, setMemoryContent] = useState("");
  const [grantForm, setGrantForm] = useState(false);
  const [grantScope, setGrantScope] = useState<string[]>([]);
  const [grantDuration, setGrantDuration] = useState("3600");
  const [toast, setToast] = useState("");
  const [launcher, setLauncher] = useState(false);
  const [message, setMessage] = useState("");
  const [grantId, setGrantId] = useState("");
  const [chat, setChat] = useState<
    { role: "user" | "assistant"; text: string; model?: string }[]
  >([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [global, setGlobal] = useState<GlobalData | null>(null);
  const [globalError, setGlobalError] = useState("");
  const [simulation, setSimulation] = useState<GlobalData | null>(null);
  const [report, setReport] = useState<GlobalData | null>(null);
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const next = await request<CoreState>(token, "/api/state");
      setCore((previous) =>
        previous
          ? {
              ...next,
              memories:
                JSON.stringify(previous.memories) ===
                JSON.stringify(next.memories)
                  ? previous.memories
                  : next.memories,
            }
          : next,
      );
      setConnection("online");
    } catch (e) {
      setConnection("offline");
      if (!core) setError((e as Error).message);
    }
  }, [token, !!core]);
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window) || token) return;
    let cancelled = false;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string | null>("local_session_token"))
      .then((value) => {
        if (value && !cancelled) {
          sessionStorage.setItem("omni.token", value);
          setToken(value);
        }
      })
      .catch(() => {
        /* Manual session entry remains available if native provisioning is absent. */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!token) {
      setConnection("offline");
      return;
    }
    setConnection("connecting");
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [refresh, token]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setLauncher((v) => !v);
      }
      if (event.key === "Escape") {
        setLauncher(false);
        setSelected(null);
        setNewMemory(false);
        setGrantForm(false);
        setReport(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const show = () => setLauncher(true);
    window.addEventListener("omni:launcher", show);
    return () => window.removeEventListener("omni:launcher", show);
  }, []);
  useEffect(() => {
    if (!selected && !newMemory && !grantForm && !launcher && !report) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [!!selected, newMemory, grantForm, launcher, !!report]);
  useEffect(() => {
    if (selected) setEditContent(selected.content);
  }, [selected?.id]);
  const loadCollective = useCallback(async () => {
    try {
      const response = await fetch(`${COLLECTOR}/api/v1/global`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok)
        throw new Error(`Collector returned ${response.status}`);
      setGlobal(await response.json());
      setGlobalError("");
    } catch (e) {
      setGlobalError((e as Error).message);
    }
    try {
      const response = await fetch(`${COLLECTOR}/api/simulation`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) setSimulation(await response.json());
    } catch {
      /* The simulation controller is optional. */
    }
  }, []);
  useEffect(() => {
    if (view === "collective" || view === "network") void loadCollective();
  }, [view, loadCollective]);
  useEffect(() => {
    if (view !== "collective") return;
    let socket: WebSocket | null = null;
    const connect = () => {
      socket?.close();
      socket = null;
      if (document.hidden) return;
      socket = new WebSocket("ws://127.0.0.1:3008/api/v1/events");
      socket.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);
          if (
            ["global.snapshot", "global.updated"].includes(update.type) &&
            update.data &&
            typeof update.data === "object"
          ) {
            setGlobal(update.data);
            setGlobalError("");
          }
        } catch {
          /* Ignore malformed aggregate messages without modifying local state. */
        }
      };
      socket.onerror = () =>
        setGlobalError("Live updates unavailable. Use Refresh to reconnect.");
    };
    connect();
    document.addEventListener("visibilitychange", connect);
    return () => {
      document.removeEventListener("visibilitychange", connect);
      socket?.close();
    };
  }, [view]);
  const activeGrants = useMemo(
    () => core?.grants.filter(isActive) || [],
    [core],
  );
  const filtered = useMemo(
    () =>
      core?.memories.filter((m) =>
        m.content.toLowerCase().includes(query.toLowerCase()),
      ) || [],
    [core?.memories, query],
  );
  const mutate = async (path: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      await request(token, path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const value = draftToken.trim();
      const state = await request<CoreState>(value, "/api/state");
      sessionStorage.setItem("omni.token", value);
      setToken(value);
      setCore(state);
      setConnection("online");
      setDraftToken("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const logout = () => {
    sessionStorage.removeItem("omni.token");
    setToken("");
    setCore(null);
    setChat([]);
    setError("");
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim() || chatBusy) return;
    const text = message.trim();
    setMessage("");
    setChat((list) => [...list, { role: "user", text }]);
    setChatBusy(true);
    setError("");
    try {
      const reply = await request<ChatReply>(token, "/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          ...(grantId ? { grant_id: grantId } : {}),
        }),
      });
      setChat((list) => [
        ...list,
        { role: "assistant", text: reply.reply, model: reply.model },
      ]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setMessage(text);
    } finally {
      setChatBusy(false);
    }
  };
  const selectMemory = (memory: Memory) => {
    setSelected(memory);
    setError("");
  };
  const prepareAnalytics = async () => {
    setBusy(true);
    setError("");
    try {
      setReport(
        await request<GlobalData>(token, "/api/analytics/prepare", {
          method: "POST",
          body: "{}",
        }),
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const synthetic =
    core?.stats.simulation === true || core?.simulation === true;

  if (!token || !core)
    return (
      <div className="login-page">
        <div className="login-top">
          <Brand />
          <span className="version">
            PERSONAL CONTEXT LAYER · LOCAL PREVIEW
          </span>
        </div>
        <div className="login-orbit">
          <div />
          <div />
          <div />
          <Fingerprint size={70} />
        </div>
        <main className="login-card">
          <div className="eyebrow">A SPACE THAT BELONGS TO YOU</div>
          <h1>
            Your context.
            <br />
            <span>Your authority.</span>
          </h1>
          <p>
            Your memories stay in your local vault. You decide what every AI
            gets to know.
          </p>
          <form onSubmit={login}>
            <label htmlFor="token">Unlock your local session</label>
            <div className="token-input">
              <KeyRound size={17} />
              <input
                id="token"
                type="password"
                autoComplete="off"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="Paste the session token from run.sh"
                required
              />
            </div>
            <button className="primary" disabled={busy}>
              {busy ? "Connecting…" : "Open my space"}
              <ArrowRight size={17} />
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="login-note">
            <LockKeyhole size={14} />
            <span>Connects only to this device · 127.0.0.1</span>
          </div>
          {token && (
            <button className="text-button" onClick={logout}>
              Use another session token
            </button>
          )}
        </main>
        <footer className="login-footer">
          <span>LOCAL BY DESIGN</span>
          <span>Memory · Permissions · Continuity</span>
          <span>OMNI / 001</span>
        </footer>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace">
          <div className="avatar">
            <Fingerprint size={20} />
          </div>
          <div>
            <strong>Personal space</strong>
            <span>
              <i className={`status-dot ${connection}`} />
              {connection === "online"
                ? "Local vault connected"
                : connection === "connecting"
                  ? "Connecting…"
                  : "Core unavailable"}
            </span>
          </div>
        </div>
        <div className="nav-label">YOUR INTELLIGENCE</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              title={item.label}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "memories" && <em>{core.memories.length}</em>}
              {view === item.id && <span className="nav-marker" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={21} />
            <strong>Under your control</strong>
            <p>
              {core.vault.encrypted
                ? "Your vault is encrypted at rest."
                : "Vault encryption is unavailable."}
              <br />
              Sharing requires a permission.
            </p>
            <span>
              {core.vault.key_storage === "keychain"
                ? "OS KEYCHAIN"
                : "DEVELOPMENT KEY FILE"}
            </span>
          </div>
          <button
            aria-label="Toggle low energy mode"
            title="Toggle low energy mode"
            className={`green-button ${green ? "enabled" : ""}`}
            onClick={() => {
              setGreen((v) => !v);
              localStorage.setItem("omni.green", String(!green));
            }}
          >
            <Leaf size={16} />
            <span>Low energy mode</span>
            <span className={`switch ${green ? "on" : ""}`} />
          </button>
          <button className="logout" onClick={logout}>
            <LogOut size={15} /> Lock session
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your space <ChevronRight size={14} />
            <span>{nav.find((n) => n.id === view)?.label}</span>
          </div>
          <div className="top-actions">
            <span className="local-badge">
              <span /> ON THIS DEVICE
            </span>
            <button
              className="command-button"
              aria-label="Ask with context"
              onClick={() => setLauncher(true)}
            >
              <Search size={15} />
              <span>Ask with context</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button"
              title="Refresh local state"
              aria-label="Refresh local state"
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <main className="content">
          {synthetic && (
            <div className="simulation-banner">
              <Sparkles size={15} />
              <span>
                SYNTHETIC DEMONSTRATION — memories and interactions in this
                space are seeded test data.
              </span>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {connection === "offline" && (
            <div className="error-banner">
              Your local core is unavailable. Showing the last received state;
              actions may fail.
            </div>
          )}
          {view === "overview" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">THE PERSONAL CONTEXT LAYER</div>
                  <h1>
                    A little more you.
                    <br />
                    <span>In every interaction.</span>
                  </h1>
                  <p>Your knowledge, connected. Your boundaries, respected.</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setNewMemory(true)}
                >
                  <Plus size={16} /> Add a memory
                </button>
              </section>
              <div className="overview-grid">
                <section className="graph-card">
                  <div className="graph-top">
                    <div>
                      <span className="eyebrow">NEBULA / LOCAL MEMORY</span>
                      <h2>Your constellation</h2>
                    </div>
                    <span className="pill">
                      <LockKeyhole size={12} /> Private
                    </span>
                  </div>
                  <Nebula
                    memories={core.memories}
                    green={green}
                    onSelect={selectMemory}
                  />
                  <div className="graph-center-label">
                    <span>YOUR LOCAL VAULT</span>
                    <strong>
                      {core.memories.length}
                      <small>memories</small>
                    </strong>
                  </div>
                  <div className="graph-coordinate">
                    LOCAL SPACE
                    <br />
                    01 — PERSONAL
                  </div>
                  <div className="graph-bottom">
                    <div className="legend">
                      <span>
                        <i className="mint" />
                        Confirmed
                      </span>
                      <span>
                        <i className="blue" />
                        Proposed
                      </span>
                      <span>
                        <i className="amber" />
                        Disputed
                      </span>
                    </div>
                    <span>Drag to explore · scroll to zoom</span>
                  </div>
                </section>
                <aside className="overview-side">
                  <section className="metric-card">
                    <div className="metric-label">
                      <Database size={17} /> YOUR MEMORY
                    </div>
                    <div className="big-number">
                      {formatCount(core.memories.length)}
                      <span>local memories</span>
                    </div>
                    <div className="metric-breakdown">
                      <span>
                        {
                          core.memories.filter((m) => m.status === "confirmed")
                            .length
                        }{" "}
                        confirmed
                      </span>
                      <span>
                        {
                          core.memories.filter((m) => m.status === "proposed")
                            .length
                        }{" "}
                        to review
                      </span>
                    </div>
                    <button
                      className="card-link"
                      onClick={() => setView("memories")}
                    >
                      Curate your memory
                      <ArrowUpRight size={16} />
                    </button>
                  </section>
                  <section className="metric-card permission-metric">
                    <div className="metric-label">
                      <Shield size={17} /> YOUR BOUNDARIES
                    </div>
                    <div className="big-number">
                      {activeGrants.length}
                      <span>active permissions</span>
                    </div>
                    <p>
                      Only approved destinations can receive selected memories.
                    </p>
                    <button
                      className="card-link"
                      onClick={() => setView("permissions")}
                    >
                      Review access
                      <ArrowUpRight size={16} />
                    </button>
                  </section>
                  <section className="connection-card">
                    <div className="connected-icon">
                      <Network size={18} />
                    </div>
                    <div>
                      <strong>
                        {core.provider.model || "No model configured"}
                      </strong>
                      <span>
                        {core.provider.base_url.includes("127.0.0.1") ||
                        core.provider.base_url.includes("localhost")
                          ? "Local model endpoint"
                          : "External model endpoint"}
                      </span>
                    </div>
                    <i className="status-dot online" />
                  </section>
                </aside>
              </div>
              <div className="graph-disclaimer">
                Each luminous node is a stored memory. Lines show vault
                membership; surrounding particles are decorative.
              </div>
              <section className="recent-section">
                <div className="section-heading">
                  <div>
                    <h2>What your AI gets to know</h2>
                    <p>Review the context that represents you.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView("memories")}
                  >
                    View all memories
                    <ArrowRight size={15} />
                  </button>
                </div>
                {core.memories.length ? (
                  <div className="memory-preview-grid">
                    {core.memories
                      .slice(-3)
                      .reverse()
                      .map((m, i) => (
                        <button
                          className="memory-preview"
                          key={m.id}
                          onClick={() => selectMemory(m)}
                        >
                          <div>
                            <span className="memory-index">0{i + 1}</span>
                            <span className={`status-chip ${m.status}`}>
                              {m.status}
                            </span>
                          </div>
                          <p>{m.content}</p>
                          <footer>
                            <span>{dateLabel(m.updated_at)}</span>
                            <ArrowUpRight size={16} />
                          </footer>
                        </button>
                      ))}
                  </div>
                ) : (
                  <Empty
                    title="Your memory starts with you"
                    body="Add a preference, a project constraint, or a fact you want your AI to remember. Nothing is captured automatically."
                  />
                )}
              </section>
              <div className="bottom-strip">
                <div>
                  <ShieldCheck size={16} />
                  <span>
                    Memory storage stays local. You control disclosure.
                  </span>
                </div>
                <button onClick={() => setView("collective")}>
                  Analytics{" "}
                  {core.analytics.opt_in ? "enabled" : "off by default"}
                  <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}
          {view === "memories" && (
            <>
              <SectionTitle
                eyebrow="A MEMORY YOU CAN CORRECT"
                title="Your memory, in your words."
                text="Confirm what is true, revise what changed, remove what should be forgotten."
                action={
                  <button
                    className="primary small"
                    onClick={() => setNewMemory(true)}
                  >
                    <Plus size={16} />
                    Add memory
                  </button>
                }
              />
              <div className="list-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search memories"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your local memory…"
                  />
                </div>
                <span>{filtered.length} memories</span>
              </div>
              {filtered.length ? (
                <div className="memory-list">
                  {filtered.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => selectMemory(m)}
                      className="memory-row"
                      data-memory-id={m.id}
                    >
                      <div className={`memory-glyph ${m.status}`}>
                        <Database size={17} />
                      </div>
                      <div className="memory-row-body">
                        <p>{m.content}</p>
                        <span>
                          {dateLabel(m.updated_at)} · Source{" "}
                          {m.source_id.slice(0, 8)}
                        </span>
                      </div>
                      <span className={`status-chip ${m.status}`}>
                        {m.status}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title={query ? "No matching memories" : "A clean slate"}
                  body={
                    query
                      ? "Try a different phrase. Search runs entirely on this device."
                      : "Store a small fact to begin. Captured content is proposed for your review."
                  }
                />
              )}
            </>
          )}
          {view === "permissions" && (
            <>
              <SectionTitle
                eyebrow="THE RIGHT CONTEXT. THE RIGHT RECIPIENT."
                title="You decide who knows."
                text="Permissions name a destination, a set of memories and an expiry. Revoke future access at any time."
                action={
                  <button
                    className="primary small"
                    onClick={() => {
                      setGrantForm(true);
                      setGrantScope([]);
                    }}
                  >
                    <Plus size={16} />
                    Create permission
                  </button>
                }
              />
              <div className="info-note">
                <ShieldCheck size={19} />
                <p>
                  Revocation stops future disclosures through OMNI. It cannot
                  retrieve copies already received by an external provider.
                </p>
              </div>
              {core.grants.length ? (
                <div className="grant-grid">
                  {core.grants.map((g) => (
                    <article
                      className={`grant-card ${isActive(g) ? "" : "inactive"}`}
                      key={g.id}
                      data-grant-id={g.id}
                    >
                      <div className="grant-card-header">
                        <div className="provider-icon">
                          <Network size={21} />
                        </div>
                        <span
                          className={`status-chip ${isActive(g) ? "confirmed" : "superseded"}`}
                        >
                          {g.revoked_at
                            ? "revoked"
                            : isActive(g)
                              ? "active"
                              : "expired"}
                        </span>
                      </div>
                      <h3>{g.destination}</h3>
                      <dl>
                        <div>
                          <dt>Memory access</dt>
                          <dd>
                            {g.scope.includes("*")
                              ? "All confirmed memories"
                              : `${g.scope.length} selected`}
                          </dd>
                        </div>
                        <div>
                          <dt>Expires</dt>
                          <dd>{dateLabel(g.expires_at)}</dd>
                        </div>
                      </dl>
                      <button
                        className="secondary full"
                        disabled={busy || !isActive(g)}
                        onClick={async () => {
                          if (await mutate(`/api/grants/${g.id}`, "DELETE"))
                            setToast("Future access revoked.");
                        }}
                      >
                        <Shield size={15} />
                        Revoke access
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No permissions granted"
                  body="Your models can answer without memory. Create a scoped permission when you want to share context."
                />
              )}
            </>
          )}
          {view === "activity" && (
            <>
              <SectionTitle
                eyebrow="A RECORD YOU CAN INSPECT"
                title="Every disclosure, visible."
                text="These receipts record the memories sent through OMNI, their destination and the time of disclosure."
              />
              <div className="stat-row">
                <MiniStat
                  label="Interactions"
                  value={core.stats.interactions}
                />
                <MiniStat label="Disclosures" value={core.stats.disclosures} />
                <MiniStat
                  label="Active permissions"
                  value={activeGrants.length}
                />
              </div>
              {core.receipts.length ? (
                <div className="activity-list">
                  {[...core.receipts].reverse().map((r) => (
                    <article key={r.id}>
                      <div className="activity-icon">
                        <ArrowUpRight size={19} />
                      </div>
                      <div>
                        <h3>
                          {r.memory_ids.length}{" "}
                          {r.memory_ids.length === 1 ? "memory" : "memories"}{" "}
                          disclosed
                        </h3>
                        <p>{r.destination}</p>
                        <span>
                          {r.memory_ids
                            .map((id) => id.slice(0, 8))
                            .join(" · ") || "No memory context"}
                        </span>
                      </div>
                      <time>{dateLabel(r.created_at)}</time>
                      <span className="receipt-id">#{r.id.slice(0, 8)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No disclosure receipts yet"
                  body="When a permitted memory is sent through OMNI, the receipt appears here. Requests made outside OMNI are not observed."
                />
              )}
            </>
          )}
          {view === "network" && (
            <>
              <SectionTitle
                eyebrow="LOCAL CONNECTIONS"
                title="See the boundaries."
                text="OMNI connects applications, your private vault and the model endpoint you configure."
              />
              <div className="network-flow">
                <div>
                  <Command size={28} />
                  <strong>Application</strong>
                  <span>Launcher / explicit capture</span>
                </div>
                <ArrowRight />
                <div className="flow-core">
                  <Fingerprint size={30} />
                  <strong>OMNI local core</strong>
                  <span>Memory + permissions</span>
                </div>
                <ArrowRight />
                <div>
                  <Network size={28} />
                  <strong>Model endpoint</strong>
                  <span>{core.provider.model}</span>
                </div>
              </div>
              <div className="detail-grid">
                <article className="detail-card">
                  <div className="metric-label">
                    <Network size={18} />
                    MODEL CONNECTION
                  </div>
                  <h3>Configured destination</h3>
                  <code>{core.provider.base_url}</code>
                  <p>
                    Provider settings are configured locally by environment
                    variables. This status shows configuration, not a successful
                    provider health check.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setLauncher(true)}
                  >
                    Try a request
                    <ArrowRight size={15} />
                  </button>
                </article>
                <article className="detail-card">
                  <div className="metric-label">
                    <Shield size={18} />
                    TRANSPORT LAB
                  </div>
                  <h3>WireGuard packet simulation</h3>
                  <p>
                    The development transport lab exercises encrypted tunnel
                    packets. It does not route your device traffic or decrypt
                    arbitrary HTTPS applications.
                  </p>
                  <span className="pill amber-pill">SIMULATION ONLY</span>
                  {simulation && <SimulationResult data={simulation} />}
                </article>
              </div>
              <div className="info-note">
                <Eye size={20} />
                <p>
                  Browser capture is an explicit action in the extension. OMNI
                  does not record global keystrokes, silently scrape tabs, or
                  claim coverage of unsupported applications.
                </p>
              </div>
            </>
          )}
          {view === "collective" && (
            <>
              <SectionTitle
                eyebrow="OPTIONAL. BOUNDED. TRANSPARENT."
                title="The bigger picture."
                text="Aggregate statistics are separate from your private memory. No global trend is invented for this view."
                action={
                  <button
                    className="secondary"
                    onClick={() => void loadCollective()}
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                }
              />
              <div className="collective-grid">
                <article className="detail-card">
                  <div className="metric-label">
                    <ShieldCheck size={18} />
                    LOCAL PRIVACY BUDGET
                  </div>
                  <h3>
                    {core.analytics.opt_in
                      ? "Participation enabled"
                      : "Participation is off"}
                  </h3>
                  <p>
                    Reports use bounded, locally randomized metrics.
                    Differential privacy limits statistical disclosure; it does
                    not guarantee absolute anonymity.
                  </p>
                  <div className="budget-number">
                    {core.analytics.budget_used.toFixed(2)}
                    <span> / {core.analytics.budget_limit.toFixed(2)} ε</span>
                  </div>
                  <div className="budget-track">
                    <div
                      style={{
                        width: `${Math.min(100, (core.analytics.budget_used / Math.max(core.analytics.budget_limit, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="budget-labels">
                    <span>Privacy budget consumed</span>
                    <span>{core.analytics.reports} reports</span>
                  </div>
                  <button
                    className="secondary full"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await mutate("/api/analytics/consent", "POST", {
                          enabled: !core.analytics.opt_in,
                        })
                      )
                        setToast(
                          core.analytics.opt_in
                            ? "Participation disabled."
                            : "Participation enabled.",
                        );
                    }}
                  >
                    {core.analytics.opt_in
                      ? "Disable participation"
                      : "Enable participation"}
                  </button>
                  <button
                    className="primary full"
                    style={{ marginTop: 12 }}
                    disabled={busy || !core.analytics.opt_in}
                    onClick={() => void prepareAnalytics()}
                  >
                    Review this week’s report
                    <ArrowRight size={15} />
                  </button>
                  <p className="data-caption">
                    Preparing the first report for a week reserves 1 ε of the
                    lifetime pilot budget. Reviewing it again reuses the same
                    report. Sending remains a separate action.
                  </p>
                </article>
                <article className="detail-card">
                  <div className="metric-label">
                    <Globe2 size={18} />
                    COLLECTOR
                  </div>
                  <h3>Published aggregate</h3>
                  {global ? (
                    <AggregatePanel data={global} />
                  ) : (
                    <Empty
                      title="No aggregate available"
                      body={
                        globalError ||
                        "The collector has not returned a published aggregate."
                      }
                    />
                  )}
                </article>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            OMNI <span>/</span> PERSONAL CONTEXT LAYER
          </span>
          <span>
            <i className="status-dot online" />{" "}
            {green ? "LOW ENERGY · RENDER ON DEMAND" : "NEBULA · UP TO 30 FPS"}
            <span className="footer-separator">/</span>LOCAL PREVIEW 0.1
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {(newMemory || selected || grantForm) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setNewMemory(false);
            setSelected(null);
            setGrantForm(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              grantForm
                ? "Create permission"
                : selected
                  ? "Edit memory"
                  : "Add memory"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => {
                setNewMemory(false);
                setSelected(null);
                setGrantForm(false);
              }}
            >
              <X size={20} />
            </button>
            {grantForm ? (
              <>
                <div className="eyebrow">A PRECISE PERMISSION</div>
                <h2>Share just enough.</h2>
                <p>Authorize memories for the configured model endpoint.</p>
                <label>Destination</label>
                <code className="endpoint-code">{core.provider.base_url}</code>
                <label>Memories</label>
                <div className="scope-list">
                  {core.memories.some((m) => m.status === "confirmed") ? (
                    core.memories
                      .filter((m) => m.status === "confirmed")
                      .map((m) => (
                        <label key={m.id}>
                          <input
                            type="checkbox"
                            checked={grantScope.includes(m.id)}
                            onChange={(e) =>
                              setGrantScope((ids) =>
                                e.target.checked
                                  ? [...ids, m.id]
                                  : ids.filter((id) => id !== m.id),
                              )
                            }
                          />
                          <span>{m.content}</span>
                        </label>
                      ))
                  ) : (
                    <p>Confirm a memory first to create a scoped permission.</p>
                  )}
                </div>
                <label htmlFor="expiry">Expires after</label>
                <select
                  id="expiry"
                  value={grantDuration}
                  onChange={(e) => setGrantDuration(e.target.value)}
                >
                  <option value="900">15 minutes</option>
                  <option value="3600">1 hour</option>
                  <option value="86400">24 hours</option>
                </select>
                <button
                  className="primary full"
                  disabled={busy || grantScope.length === 0}
                  onClick={async () => {
                    if (
                      await mutate("/api/grants", "POST", {
                        destination: core.provider.base_url,
                        scope: grantScope,
                        expires_in_seconds: Number(grantDuration),
                      })
                    ) {
                      setGrantForm(false);
                      setToast("Scoped permission created.");
                    }
                  }}
                >
                  Authorize {grantScope.length} memories
                  <ShieldCheck size={17} />
                </button>
              </>
            ) : (
              <>
                <div className="eyebrow">YOUR MEMORY / LOCAL ONLY</div>
                <h2>{selected ? "Make it yours." : "A small piece of you."}</h2>
                <p>
                  {selected
                    ? "Correct this memory and choose whether it represents you."
                    : "Store one clear fact, preference or constraint. You remain the editor."}
                </p>
                <label htmlFor="memory-content">Memory content</label>
                <textarea
                  id="memory-content"
                  autoFocus
                  rows={6}
                  value={selected ? editContent : memoryContent}
                  onChange={(e) =>
                    selected
                      ? setEditContent(e.target.value)
                      : setMemoryContent(e.target.value)
                  }
                  placeholder="For example: prefer concise answers, with sources for factual claims."
                />
                {selected && (
                  <div className="memory-meta">
                    <span>Source: {selected.source_id}</span>
                    <span>Updated {dateLabel(selected.updated_at)}</span>
                  </div>
                )}
                <div className="modal-actions">
                  {selected ? (
                    <>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await mutate(
                              `/api/memories/${selected.id}`,
                              "DELETE",
                            )
                          ) {
                            setSelected(null);
                            setToast("Memory removed from your vault.");
                          }
                        }}
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                      <select
                        aria-label="Memory status"
                        value={selected.status}
                        onChange={(e) =>
                          setSelected({
                            ...selected,
                            status: e.target.value as MemoryStatus,
                          })
                        }
                      >
                        <option value="proposed">Proposed</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="disputed">Disputed</option>
                        <option value="superseded">Superseded</option>
                      </select>
                      <button
                        className="primary"
                        disabled={busy || !editContent.trim()}
                        onClick={async () => {
                          if (
                            await mutate(
                              `/api/memories/${selected.id}`,
                              "PATCH",
                              {
                                content: editContent.trim(),
                                status: selected.status,
                              },
                            )
                          ) {
                            setSelected(null);
                            setToast("Memory updated.");
                          }
                        }}
                      >
                        Save changes
                        <Check size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary full"
                      disabled={busy || !memoryContent.trim()}
                      onClick={async () => {
                        if (
                          await mutate("/api/memories", "POST", {
                            content: memoryContent.trim(),
                            status: "confirmed",
                            source: "manual",
                          })
                        ) {
                          setNewMemory(false);
                          setMemoryContent("");
                          setToast("Memory saved locally.");
                        }
                      }}
                    >
                      Save to my vault
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
      {report && (
        <div className="modal-backdrop" onClick={() => setReport(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review analytics report"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setReport(null)}
              aria-label="Close report"
            >
              <X size={20} />
            </button>
            <div className="eyebrow">ONLY THIS REPORT LEAVES</div>
            <h2>Inspect before sharing.</h2>
            <p>
              This randomized payload contains no prompt, response or memory
              text. Its report ID allows retries without creating duplicate
              contributions. Network metadata remains visible to the collector.
            </p>
            <pre className="json-readout">
              {JSON.stringify(report, null, 2)}
            </pre>
            <button
              className="primary full"
              disabled={busy || !core.analytics.opt_in}
              onClick={async () => {
                if (await mutate("/api/analytics/send", "POST", {})) {
                  setReport(null);
                  setToast("Report submitted by the local privacy engine.");
                  await loadCollective();
                }
              }}
            >
              Send through privacy engine
              <ArrowUpRight size={16} />
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
      {launcher && (
        <div
          className="modal-backdrop launcher-backdrop"
          onClick={() => setLauncher(false)}
        >
          <section
            className="launcher"
            role="dialog"
            aria-modal="true"
            aria-label="Ask with context"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <Sparkles size={19} />
                <strong>Ask with context</strong>
                <span>{core.provider.model}</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setLauncher(false)}
                aria-label="Close launcher"
              >
                <X size={19} />
              </button>
            </header>
            <div className="chat-history">
              {chat.length ? (
                chat.map((entry, i) => (
                  <article key={i} className={`chat-entry ${entry.role}`}>
                    <div>
                      {entry.role === "user" ? (
                        <Fingerprint size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      <strong>
                        {entry.role === "user" ? "You" : entry.model || "Model"}
                      </strong>
                    </div>
                    <p>{entry.text}</p>
                  </article>
                ))
              ) : (
                <div className="chat-intro">
                  <div className="chat-emblem">
                    <MessageSquare size={28} />
                  </div>
                  <h2>Bring the right part of you.</h2>
                  <p>
                    Choose a permission to include approved memories.
                    <br />
                    Without one, your message is sent without memory context.
                  </p>
                </div>
              )}
              {chatBusy && (
                <div className="thinking">
                  <span />
                  <span />
                  <span />
                  <p>Waiting for your configured model…</p>
                </div>
              )}
            </div>
            <form onSubmit={send}>
              <div className="context-selector">
                <Shield size={14} />
                <select
                  aria-label="Permission for context"
                  value={grantId}
                  onChange={(e) => setGrantId(e.target.value)}
                >
                  <option value="">No memory context</option>
                  {activeGrants
                    .filter((g) => g.destination === core.provider.base_url)
                    .map((g) => (
                      <option value={g.id} key={g.id}>
                        {g.scope.includes("*")
                          ? "All"
                          : `Up to ${g.scope.length}`}{" "}
                        confirmed memories · expires {dateLabel(g.expires_at)}
                      </option>
                    ))}
                </select>
                <LockKeyhole size={13} />
                <span>
                  {core.provider.base_url.includes("127.0.0.1") ||
                  core.provider.base_url.includes("localhost")
                    ? "Local destination"
                    : "External destination"}
                </span>
              </div>
              <div className="composer">
                <textarea
                  autoFocus
                  rows={2}
                  aria-label="Your message"
                  placeholder="What are you working on?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (message.trim() && !chatBusy)
                        e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button
                  className="send-button"
                  disabled={!message.trim() || chatBusy}
                  aria-label="Send message"
                >
                  <Send size={17} />
                </button>
              </div>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <span>Enter to send · Shift + Enter for a new line</span>
              <span>
                Request + permitted context go to the configured endpoint
              </span>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="page-heading compact">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </section>
  );
}
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{formatCount(value)}</strong>
    </div>
  );
}

function AggregatePanel({ data }: { data: GlobalData }) {
  const histograms = data.histograms as Record<string, number[]> | null;
  const labels: Record<string, string[]> = {
    topics: [
      "Inactive",
      "Other",
      "Coding",
      "Writing",
      "Research",
      "Planning",
      "Learning",
      "Business",
    ],
    latency: [
      "Inactive",
      "Unknown",
      "<250ms",
      "250ms–1s",
      "1–3s",
      "3–10s",
      "10–30s",
      ">30s",
    ],
    tokens: [
      "Inactive",
      "Unknown",
      "<128",
      "128–512",
      "512–2k",
      "2k–8k",
      "8k–32k",
      ">32k",
    ],
  };
  const uncertainty = data.uncertainty as {
    pointwise_95_half_width?: number;
  } | null;
  return (
    <>
      {data.simulation === true && (
        <span className="pill amber-pill">SYNTHETIC REPORTS</span>
      )}
      <p>
        {Number(data.report_count) || 0} installation reports ·{" "}
        {typeof data.week === "string" ? data.week : "No reporting week yet"}
      </p>
      {data.status !== "published" || !histograms ? (
        <Empty
          title="Waiting for enough reports"
          body={`Publication requires ${formatCount(Number(data.minimum_reports) || 10000)} reports. Nothing is published below that threshold.`}
        />
      ) : (
        <>
          {Object.entries(histograms).map(([name, values]) => {
            const max = Math.max(...values.map(Math.abs), 0.01);
            return (
              <div className="chart-group" key={name}>
                <h4>{name} · bounded histogram</h4>
                <div
                  className="histogram"
                  role="img"
                  aria-label={`${name} histogram: ${values.map((v, i) => `bin ${i + 1}: ${v.toFixed(3)}`).join(", ")}`}
                >
                  {values.map((value, i) => (
                    <div
                      key={i}
                      className={value < 0 ? "negative" : ""}
                      title={`${labels[name]?.[i] || `Bin ${i + 1}`}: ${value.toFixed(4)}`}
                    >
                      <i
                        style={{
                          height: `${(Math.abs(value) / max) * 37}%`,
                          ...(value < 0 ? { top: "50%" } : { bottom: "50%" }),
                        }}
                      />
                      <span>{value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="histogram-labels">
                  {values.map((_, i) => (
                    <span key={i}>{labels[name]?.[i] || `B${i + 1}`}</span>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="data-caption">
            Values are noisy average histogram contributions, not population
            percentages. Negative estimates can occur after randomization.{" "}
            {typeof uncertainty?.pointwise_95_half_width === "number"
              ? `Approximate pointwise 95% half-width: ±${uncertainty.pointwise_95_half_width.toFixed(3)} (DP noise only).`
              : ""}
          </p>
        </>
      )}
      <p className="data-caption">
        Scope:{" "}
        {typeof data.scope === "string"
          ? data.scope
          : "opt-in installation reports, not unique people"}
        .
      </p>
    </>
  );
}
function SimulationResult({ data }: { data: GlobalData }) {
  const summary = data.summary as Record<string, unknown> | undefined;
  const assertions = Array.isArray(data.assertions) ? data.assertions : [];
  return (
    <div className="simulation-result">
      <strong>
        {data.status === "passed" ? (
          <Check size={15} />
        ) : (
          <Activity size={15} />
        )}{" "}
        {String(data.status || "not run").replaceAll("_", " ")}
      </strong>
      {summary && (
        <p>
          {String(summary.requests ?? "—")} requests ·{" "}
          {String(summary.accepted_reports ?? "—")} accepted reports
        </p>
      )}
      {assertions.length > 0 && (
        <ul>
          {assertions.slice(0, 6).map((item, i) => (
            <li key={i}>
              {typeof item === "string" ? item : JSON.stringify(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
