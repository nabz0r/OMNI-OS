import { version as appVersion } from "../package.json";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  BarChart3,
  Cpu,
  ScrollText,
  Settings2,
  AlertCircle,
  CheckCheck,
  Copy,
  FileText,
  RotateCcw,
  Square,
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
import Administration, { type AdminState } from "./Administration";
import Operations from "./Operations";
import Policies from "./Policies";
import { readTextFiles, type TextAttachment } from "./files";
import Setup from "./Setup";
import { isNative, provisionNativeSession, vaultStorageLabel } from "./native";
import {
  claimLaunchSession,
  forgetLaunchSession,
  hasLaunchSession,
} from "./session";
const Nebula = lazy(() => import("./Nebula"));
import {
  ApiError,
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
  | "policies"
  | "permissions"
  | "activity"
  | "network"
  | "collective"
  | "models"
  | "usage"
  | "logs"
  | "settings";
const nav = [
  { id: "overview" as View, label: "Overview", icon: CircleDot },
  { id: "memories" as View, label: "Memory", icon: Database },
  { id: "permissions" as View, label: "Permissions", icon: ShieldCheck },
  { id: "policies" as View, label: "Policies", icon: Shield },
  { id: "models" as View, label: "Models", icon: Cpu },
  { id: "activity" as View, label: "History", icon: Activity },
  { id: "usage" as View, label: "Usage", icon: BarChart3 },
  { id: "logs" as View, label: "Logs", icon: ScrollText },
  { id: "network" as View, label: "Connections", icon: Network },
  { id: "collective" as View, label: "Collective", icon: Globe2 },
  { id: "settings" as View, label: "Settings", icon: Settings2 },
];
type GlobalData = Record<string, unknown>;
type ChatEntry = {
  role: "user" | "assistant";
  text: string;
  model?: string;
  receiptId?: string | null;
  attachments?: TextAttachment[];
};
function buildHistory(entries: ChatEntry[], message: string) {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(message).length;
  const history: {
    role: "user" | "assistant";
    content: string;
    attachments?: TextAttachment[];
  }[] = [];
  for (let i = entries.length - 2; i >= 0 && history.length < 20; i -= 2) {
    const pair = entries.slice(i, i + 2);
    if (pair[0]?.role !== "user" || pair[1]?.role !== "assistant") break;
    const size = pair.reduce(
      (sum, entry) =>
        sum +
        encoder.encode(entry.text).length +
        (entry.attachments?.length
          ? encoder.encode(JSON.stringify(entry.attachments)).length
          : 0),
      0,
    );
    if (bytes + size > 100000) break;
    bytes += size;
    history.unshift(
      ...pair.map((entry) => ({
        role: entry.role,
        content: entry.text,
        ...(entry.attachments?.length
          ? { attachments: entry.attachments }
          : {}),
      })),
    );
  }
  return history;
}
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
  const [session, setSession] = useState(() =>
    isNative && sessionStorage.getItem("omni.locked") === "true" ? 1 : 0,
  );
  const lock = useCallback(() => setSession((value) => value + 1), []);
  return <OmniSpace key={session} onLock={lock} autoUnlock={session === 0} />;
}

function OmniSpace({
  onLock,
  autoUnlock,
}: {
  onLock: () => void;
  autoUnlock: boolean;
}) {
  const [token, setToken] = useState(() =>
    autoUnlock && !hasLaunchSession() ? initialToken() : "",
  );
  const [pairing, setPairing] = useState(
    () => autoUnlock && hasLaunchSession(),
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const setupConsidered = useRef(false);
  const tokenIdentity = useRef(token);
  tokenIdentity.current = token;
  const sessionController = useRef(new AbortController());
  const chatController = useRef<AbortController | null>(null);
  const adminSequence = useRef(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const historyElement = useRef<HTMLDivElement>(null);
  const providerIdentity = useRef("");
  const contextIdentity = useRef("");
  useEffect(() => {
    if (sessionController.current.signal.aborted)
      sessionController.current = new AbortController();
    return () => {
      sessionController.current.abort();
      chatController.current?.abort();
    };
  }, []);
  const localRequest = useCallback(
    <T,>(path: string, options: RequestInit = {}) =>
      request<T>(token, path, {
        ...options,
        signal: AbortSignal.any([
          sessionController.current.signal,
          options.signal ?? AbortSignal.timeout(90000),
        ]),
      }),
    [token],
  );
  const [draftToken, setDraftToken] = useState("");
  const [core, setCore] = useState<CoreState | null>(null);
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const [adminError, setAdminError] = useState("");
  const [historyTab, setHistoryTab] = useState<"requests" | "disclosures">(
    "requests",
  );
  const [chatProviderId, setChatProviderId] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [grantDestination, setGrantDestination] = useState("");
  const selectedProvider = admin?.providers.find(
    (item) =>
      item.id === (chatProviderId || admin.settings.primary_provider_id),
  );
  const activeProvider = selectedProvider
    ? {
        id: selectedProvider.id,
        base_url: selectedProvider.base_url,
        model: chatModel || selectedProvider.model,
        local: /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(
          selectedProvider.base_url,
        ),
      }
    : core?.provider;
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
  const [memoryFilter, setMemoryFilter] = useState<MemoryStatus | "all">("all");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureContent, setCaptureContent] = useState("");
  const [captureTitle, setCaptureTitle] = useState("");
  const [deletePending, setDeletePending] = useState(false);
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
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const attachmentEpoch = useRef(0);
  const [grantId, setGrantId] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [global, setGlobal] = useState<GlobalData | null>(null);
  const [globalError, setGlobalError] = useState("");
  const [simulation, setSimulation] = useState<GlobalData | null>(null);
  const [report, setReport] = useState<GlobalData | null>(null);
  const refresh = useCallback(async () => {
    if (!token) return;
    // A mutation must fetch again after an older poll, never reuse its stale snapshot.
    if (refreshInFlight.current) await refreshInFlight.current;
    if (
      sessionController.current.signal.aborted ||
      tokenIdentity.current !== token
    )
      return;
    const pending = (async () => {
      try {
        const next = await localRequest<CoreState>("/api/state", {
          signal: AbortSignal.timeout(8000),
        });
        if (
          sessionController.current.signal.aborted ||
          tokenIdentity.current !== token
        )
          return;
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
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (
          sessionController.current.signal.aborted ||
          tokenIdentity.current !== token
        )
          return;
        if (e instanceof ApiError && e.status === 401) {
          sessionStorage.removeItem("omni.token");
          onLock();
          return;
        }
        setConnection("offline");
        if (!core) setError((e as Error).message);
      }
    })();
    refreshInFlight.current = pending;
    await pending;
    if (refreshInFlight.current === pending) refreshInFlight.current = null;
  }, [token, !!core, localRequest, onLock]);
  const loadAdmin = useCallback(async () => {
    if (!token) return;
    const sequence = ++adminSequence.current;
    try {
      const next = await localRequest<AdminState>("/api/admin", {
        signal: AbortSignal.timeout(8000),
      });
      if (
        sessionController.current.signal.aborted ||
        tokenIdentity.current !== token
      )
        return;
      if (sequence !== adminSequence.current) return;
      setAdmin(next);
      setAdminError("");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (
        !sessionController.current.signal.aborted &&
        sequence === adminSequence.current
      )
        setAdminError((e as Error).message);
    }
  }, [token, localRequest]);
  const refreshAdministration = useCallback(async () => {
    await Promise.all([loadAdmin(), refresh()]);
  }, [loadAdmin, refresh]);
  useEffect(() => {
    if (!token) return;
    void loadAdmin();
    const timer = setInterval(() => {
      if (!document.hidden) void loadAdmin();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadAdmin, token]);
  useEffect(() => {
    if (
      chatProviderId &&
      admin &&
      !admin.providers.some(
        (item) =>
          item.id === chatProviderId && item.enabled && item.policy_allowed,
      )
    ) {
      setChatProviderId("");
      setChatModel("");
    }
  }, [admin, chatProviderId]);
  useEffect(() => {
    if (!pairing || !autoUnlock) return;
    let cancelled = false;
    void claimLaunchSession()
      .then((value) => {
        if (cancelled) return;
        sessionStorage.setItem("omni.token", value);
        tokenIdentity.current = value;
        setToken(value);
        setPairing(false);
        setError("");
        forgetLaunchSession();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPairing(false);
        setError((error as Error).message);
        forgetLaunchSession();
      });
    return () => {
      cancelled = true;
    };
  }, [pairing, autoUnlock]);
  useEffect(() => {
    if (!core || !admin || setupConsidered.current) return;
    setupConsidered.current = true;
    const untouched =
      !core.stats.simulation &&
      !core.simulation &&
      core.memories.length === 0 &&
      core.stats.interactions === 0 &&
      admin.providers.every((provider) => !provider.checked_at);
    if (untouched && localStorage.getItem("omni.setup.dismissed") !== "true")
      setSetupOpen(true);
  }, [core, admin]);
  const closeSetup = () => {
    setSetupOpen(false);
    localStorage.setItem("omni.setup.dismissed", "true");
  };
  const primaryProfile = admin?.providers.find(
    (provider) => provider.id === admin.settings.primary_provider_id,
  );
  const modelReady =
    !!primaryProfile?.enabled &&
    !!primaryProfile.policy_allowed &&
    primaryProfile.status === "available" &&
    !!primaryProfile.model;
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
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "k" &&
        !selected &&
        !newMemory &&
        !grantForm &&
        !report &&
        !captureOpen &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        setLauncher((v) => !v);
      }
      if (event.key === "Escape") {
        if (!busy) {
          setLauncher(false);
          setSelected(null);
          setNewMemory(false);
          setGrantForm(false);
          setCaptureOpen(false);
          setReport(null);
          setError("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, !!selected, newMemory, grantForm, !!report, captureOpen]);
  useEffect(() => {
    const show = () => {
      if (
        !selected &&
        !newMemory &&
        !grantForm &&
        !report &&
        !captureOpen &&
        !document.querySelector("dialog[open]")
      )
        setLauncher(true);
    };
    window.addEventListener("omni:launcher", show);
    return () => window.removeEventListener("omni:launcher", show);
  }, [!!selected, newMemory, grantForm, !!report, captureOpen]);
  useEffect(() => {
    if (
      !selected &&
      !newMemory &&
      !grantForm &&
      !launcher &&
      !report &&
      !captureOpen
    )
      return;
    const previous = document.activeElement as HTMLElement | null;
    const shell = document.querySelector<HTMLElement>(".main-shell");
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (shell) shell.inert = true;
    if (sidebar) sidebar.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
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
      if (shell) shell.inert = false;
      if (sidebar) sidebar.inert = false;
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [!!selected, newMemory, grantForm, launcher, !!report, captureOpen]);
  useEffect(() => {
    setDeletePending(false);
    if (selected) setEditContent(selected.content);
  }, [selected?.id]);
  const loadCollective = useCallback(async () => {
    if (!COLLECTOR) {
      setGlobalError(
        "Collective analytics is not connected on this device. Your local space works independently.",
      );
      return;
    }
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
    if (view !== "collective" || !COLLECTOR) return;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let disposed = false;
    const disconnect = () => {
      clearTimeout(retry);
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
        socket = null;
      }
    };
    const connect = () => {
      disconnect();
      if (disposed || document.hidden) return;
      if (!COLLECTOR) return;
      const url = new URL("/api/v1/events", COLLECTOR);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempts = 0;
      };
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
        setGlobalError("Live updates interrupted. Reconnecting automatically.");
      socket.onclose = () => {
        if (disposed || document.hidden) return;
        setGlobalError("Live updates interrupted. Reconnecting automatically.");
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 30000));
      };
    };
    connect();
    document.addEventListener("visibilitychange", connect);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", connect);
      disconnect();
    };
  }, [view]);
  useEffect(() => {
    if (!core || !activeProvider) return;
    const next = `${activeProvider.id || "default"}|${activeProvider.base_url}|${activeProvider.model}`;
    if (providerIdentity.current && providerIdentity.current !== next) {
      chatController.current?.abort();
      chatController.current = null;
      setChatBusy(false);
      setChat([]);
      attachmentEpoch.current += 1;
      setAttachments([]);
      setReadingFiles(false);
      setGrantId("");
      setToast("Model destination changed. A new conversation is ready.");
    }
    providerIdentity.current = next;
    if (
      grantId &&
      !core.grants.some(
        (grant) =>
          grant.id === grantId &&
          isActive(grant) &&
          grant.destination === activeProvider.base_url,
      )
    ) {
      chatController.current?.abort();
      chatController.current = null;
      setChatBusy(false);
      setGrantId("");
      setChat([]);
      attachmentEpoch.current += 1;
      setAttachments([]);
      setReadingFiles(false);
      setError(
        "This permission expired or was revoked. Choose a permission to start a new conversation.",
      );
    }
  }, [
    core,
    grantId,
    activeProvider?.id,
    activeProvider?.base_url,
    activeProvider?.model,
  ]);
  useEffect(() => {
    const grant = core?.grants.find(
      (item) => item.id === grantId && isActive(item),
    );
    const next = grant
      ? JSON.stringify({
          grant,
          memories: grant.scope.includes("*")
            ? [...(core?.memories ?? [])].sort((a, b) =>
                a.id.localeCompare(b.id),
              )
            : grant.scope.map(
                (id) =>
                  core?.memories.find((memory) => memory.id === id) ?? {
                    id,
                    deleted: true,
                  },
              ),
        })
      : "";
    if (contextIdentity.current && next && contextIdentity.current !== next) {
      chatController.current?.abort();
      chatController.current = null;
      setChatBusy(false);
      setChat([]);
      attachmentEpoch.current += 1;
      setAttachments([]);
      setReadingFiles(false);
      setError("");
      setToast("Authorized memories changed. A new conversation is ready.");
    }
    contextIdentity.current = next;
  }, [core?.memories, core?.grants, grantId]);
  useEffect(() => {
    if (launcher && historyElement.current)
      historyElement.current.scrollTop = historyElement.current.scrollHeight;
  }, [chat, chatBusy, launcher]);
  const activeGrants = useMemo(
    () => core?.grants.filter(isActive) || [],
    [core],
  );
  const filtered = useMemo(
    () =>
      (
        core?.memories.filter(
          (m) =>
            m.content.toLowerCase().includes(query.trim().toLowerCase()) &&
            (memoryFilter === "all" || m.status === memoryFilter),
        ) || []
      ).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [core?.memories, query, memoryFilter],
  );
  const mutate = async (path: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      await localRequest(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (
        path.startsWith("/api/memories/") ||
        path.startsWith("/api/grants/")
      ) {
        chatController.current?.abort();
        chatController.current = null;
        setChatBusy(false);
        setChat([]);
        attachmentEpoch.current += 1;
        setAttachments([]);
        setReadingFiles(false);
      }
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
      const value = isNative
        ? (await provisionNativeSession())!.token
        : draftToken.trim();
      const state = await request<CoreState>(value, "/api/state", {
        signal: AbortSignal.any([
          sessionController.current.signal,
          AbortSignal.timeout(8000),
        ]),
      });
      sessionStorage.setItem("omni.token", value);
      sessionStorage.removeItem("omni.locked");
      tokenIdentity.current = value;
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
    if (isNative) sessionStorage.setItem("omni.locked", "true");
    sessionStorage.removeItem("omni.token");
    forgetLaunchSession();
    sessionController.current.abort();
    chatController.current?.abort();
    onLock();
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim() || chatBusy || readingFiles || connection !== "online")
      return;
    if (!activeProvider?.model) {
      setError(
        "Choose a model for this provider before sending. Check its connection in Models to discover available models.",
      );
      return;
    }
    const text = message.trim();
    if (new TextEncoder().encode(text).length > 100000) {
      setError("Your message is too long. Keep it under 100,000 UTF-8 bytes.");
      return;
    }
    const previous = chat;
    const outgoingFiles = attachments;
    const history = buildHistory(previous, text);
    const controller = new AbortController();
    chatController.current = controller;
    setMessage("");
    setAttachments([]);
    setChat((list) => [
      ...list,
      { role: "user", text, attachments: outgoingFiles },
    ]);
    setChatBusy(true);
    setError("");
    try {
      const reply = await localRequest<ChatReply>("/api/chat", {
        method: "POST",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(90000),
        ]),
        body: JSON.stringify({
          message: text,
          attachments: outgoingFiles,
          history,
          ...(activeProvider?.id ? { provider_id: activeProvider.id } : {}),
          ...(activeProvider?.model ? { model: activeProvider.model } : {}),
          ...(grantId ? { grant_id: grantId } : {}),
        }),
      });
      if (controller.signal.aborted) return;
      if (!reply.reply?.trim())
        throw new Error(
          "The provider returned an empty response. Your message is ready to retry.",
        );
      setChat((list) => [
        ...list,
        {
          role: "assistant",
          text: reply.reply,
          model: reply.model,
          receiptId: reply.receipt_id,
        },
      ]);
      await refresh();
    } catch (e) {
      if (
        sessionController.current.signal.aborted ||
        chatController.current !== controller
      )
        return;
      setChat(previous);
      setMessage((draft) => draft || text);
      setAttachments(outgoingFiles);
      setError(
        controller.signal.aborted
          ? "Stopped waiting. The provider may already have received this request."
          : (e as Error).message,
      );
    } finally {
      if (chatController.current === controller) {
        chatController.current = null;
        setChatBusy(false);
      }
    }
  };
  const resetConversation = () => {
    attachmentEpoch.current += 1;
    setReadingFiles(false);
    setAttachments([]);
    setChat([]);
    setMessage("");
    setError("");
  };
  const capture = async () => {
    const content = captureContent.trim();
    if (!content || busy) return;
    if (new TextEncoder().encode(content).length > 100000) {
      setError("Keep the text under 100,000 UTF-8 bytes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await localRequest<{
        memories: Memory[];
        extraction: string;
      }>("/api/capture", {
        method: "POST",
        body: JSON.stringify({
          content,
          title: captureTitle.trim() || "Reviewed text",
          source: "manual_capture",
        }),
      });
      await refresh();
      setCaptureOpen(false);
      setCaptureContent("");
      setCaptureTitle("");
      setMemoryFilter("proposed");
      setQuery("");
      setView("memories");
      setToast(
        result.extraction !== "local_model_proposals"
          ? "Source saved. Review the excerpt; local extraction was unavailable."
          : `${result.memories.length} ${result.memories.length === 1 ? "memory" : "memories"} ready for your review.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
        await localRequest<GlobalData>("/api/analytics/prepare", {
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
          {pairing || (token && connection === "connecting" && !error) ? (
            <div className="session-opening" role="status">
              <span className="session-spinner" />
              <div>
                <strong>Opening your private space…</strong>
                <p>Connecting securely to this device.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={login}>
              {!isNative && (
                <>
                  <label htmlFor="token">Unlock your local session</label>
                  <div className="token-input">
                    <KeyRound size={17} />
                    <input
                      id="token"
                      type="password"
                      autoComplete="off"
                      value={draftToken}
                      onChange={(e) => setDraftToken(e.target.value)}
                      placeholder="Your private local session token"
                      required
                    />
                  </div>
                </>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Connecting…"
                  : isNative
                    ? "Unlock on this device"
                    : "Open my space"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {!pairing && !token && !isNative && (
            <p className="unlock-help">
              Launch OMNI to open this space automatically. Manual unlock is
              available with the private token in{" "}
              <code>.omni/runtime/admin-token</code>.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="login-note">
            <LockKeyhole size={14} />
            <span>
              {isNative
                ? "Your encrypted vault · On this device"
                : "Connects only to this device · 127.0.0.1"}
            </span>
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
              aria-current={view === item.id ? "page" : undefined}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "memories" && <em>{core.memories.length}</em>}
              {view === item.id && item.id !== "memories" && (
                <span className="nav-marker" />
              )}
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
              {vaultStorageLabel(core.vault.key_storage).toUpperCase()}
            </span>
          </div>
          <button
            aria-label="Toggle low energy mode"
            title="Toggle low energy mode"
            aria-pressed={green}
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
          <button
            className="logout"
            onClick={logout}
            aria-label="Lock session"
            title="Lock session"
          >
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
          {connection === "offline" && (
            <div className="offline-banner" role="status">
              <AlertCircle size={18} />
              <div>
                <strong>Your local service is offline.</strong>
                <span>
                  Showing the last loaded state. Reconnect before making
                  changes.
                </span>
              </div>
              <button onClick={() => void refresh()}>
                Try again <RefreshCw size={14} />
              </button>
            </div>
          )}
          {synthetic && (
            <div className="simulation-banner">
              <Sparkles size={15} />
              <span>
                SYNTHETIC DEMONSTRATION — memories and interactions in this
                space are seeded test data.
              </span>
            </div>
          )}
          {error &&
            !launcher &&
            !selected &&
            !newMemory &&
            !grantForm &&
            !report &&
            !captureOpen && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  <X size={15} />
                </button>
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
                <div className="home-actions">
                  <button
                    className="primary"
                    onClick={() =>
                      modelReady ? setLauncher(true) : setSetupOpen(true)
                    }
                    disabled={connection !== "online"}
                  >
                    {modelReady ? (
                      <MessageSquare size={17} />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    {modelReady ? "Start a conversation" : "Set up your space"}
                    <ArrowRight size={16} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setNewMemory(true)}
                  >
                    <Plus size={16} /> Add a memory
                  </button>
                </div>
              </section>
              <section
                className={`space-readiness ${modelReady ? "is-ready" : ""}`}
                aria-label="Your next step"
              >
                <span className="readiness-mark">
                  {modelReady ? <Check size={22} /> : <Sparkles size={22} />}
                </span>
                <div>
                  <strong>
                    {modelReady
                      ? `${primaryProfile?.label} is connected`
                      : "A few moments from your first conversation."}
                  </strong>
                  <p>
                    {modelReady
                      ? `${primaryProfile?.model} · Availability checked ${dateLabel(primaryProfile?.checked_at || "")}. Memory sharing stays under your control.`
                      : "Connect a local model or your AI provider. Add only the context you want to keep."}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setSetupOpen(true)}
                >
                  Guided setup <ArrowUpRight size={15} />
                </button>
              </section>
              {core.memories.length === 0 && (
                <div className="welcome-steps">
                  <div>
                    <span>01</span>
                    <strong>Add something worth remembering</strong>
                    <p>A preference, a constraint, a project you care about.</p>
                  </div>
                  <div>
                    <span>02</span>
                    <strong>Choose what can be shared</strong>
                    <p>One destination. A few memories. A clear expiry.</p>
                  </div>
                  <div>
                    <span>03</span>
                    <strong>Continue with your AI</strong>
                    <p>Useful context, with a receipt for every disclosure.</p>
                  </div>
                </div>
              )}
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
                  <Suspense
                    fallback={
                      <div className="nebula-loading" role="status">
                        Preparing your constellation…
                      </div>
                    }
                  >
                    <Nebula
                      memories={core.memories}
                      green={green}
                      onSelect={selectMemory}
                    />
                  </Suspense>
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
                    <span>Drag to explore · +/− to zoom</span>
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
                        {core.provider.local
                          ? "Local model endpoint"
                          : "External model endpoint"}
                      </span>
                    </div>
                    <span
                      className="configured-dot"
                      title="Configured endpoint; availability is checked when you send a request"
                    />
                  </section>
                </aside>
              </div>
              <div className="graph-disclaimer">
                Points are stored memories. Lines indicate vault membership, not
                semantic relationships.
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
                    {[...core.memories]
                      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                      .slice(0, 3)
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
                  <div className="heading-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setCaptureOpen(true);
                        setError("");
                      }}
                    >
                      <FileText size={16} />
                      Import text
                    </button>
                    <button
                      className="primary small"
                      onClick={() => {
                        setNewMemory(true);
                        setError("");
                      }}
                    >
                      <Plus size={16} />
                      Add memory
                    </button>
                  </div>
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
                <span>
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "memory" : "memories"}
                </span>
              </div>
              <div
                className="memory-filters"
                aria-label="Filter memories by status"
              >
                {(
                  [
                    "all",
                    "proposed",
                    "confirmed",
                    "disputed",
                    "superseded",
                  ] as const
                ).map((status) => (
                  <button
                    key={status}
                    aria-pressed={memoryFilter === status}
                    onClick={() => setMemoryFilter(status)}
                  >
                    {status === "all"
                      ? "All memories"
                      : status === "proposed"
                        ? "To review"
                        : status.charAt(0).toUpperCase() + status.slice(1)}
                    <span>
                      {
                        core.memories.filter(
                          (m) => status === "all" || m.status === status,
                        ).length
                      }
                    </span>
                  </button>
                ))}
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
                          {m.source.replaceAll("_", " ")}
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
                  title={
                    query || memoryFilter !== "all"
                      ? "No matching memories"
                      : "A clean slate"
                  }
                  body={
                    query || memoryFilter !== "all"
                      ? "Try a different phrase or status. Search runs entirely on this device."
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
          {view === "policies" && <Policies request={localRequest} />}
          {(view === "models" || view === "settings") && (
            <Administration
              view={view}
              data={admin}
              error={adminError}
              request={localRequest}
              reload={loadAdmin}
              onChanged={refreshAdministration}
              analyticsEnabled={core.analytics.opt_in}
              green={green}
              onGreen={(enabled) => {
                setGreen(enabled);
                localStorage.setItem("omni.green", String(enabled));
              }}
            />
          )}
          {(view === "usage" || view === "logs") && (
            <Operations
              view={view}
              request={localRequest}
              onOpenProviders={() => setView("models")}
            />
          )}
          {view === "activity" && (
            <div
              className="history-tabs"
              role="tablist"
              aria-label="History records"
            >
              <button
                role="tab"
                aria-selected={historyTab === "requests"}
                onClick={() => setHistoryTab("requests")}
              >
                Requests
              </button>
              <button
                role="tab"
                aria-selected={historyTab === "disclosures"}
                onClick={() => setHistoryTab("disclosures")}
              >
                Disclosure receipts
              </button>
            </div>
          )}
          {view === "activity" && historyTab === "requests" && (
            <Operations
              view="history"
              request={localRequest}
              onOpenProviders={() => setView("models")}
            />
          )}
          {view === "activity" && historyTab === "disclosures" && (
            <>
              <SectionTitle
                eyebrow="A RECORD YOU CAN INSPECT"
                title="Every disclosure, visible."
                text="Inspect what was authorized, where it was sent, and whether the request reached its destination."
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
                          {r.status === "sent"
                            ? "shared"
                            : r.status === "send_failed_or_partial"
                              ? "— delivery uncertain"
                              : "authorized"}
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
                    Manage connections and API keys in Models. This destination
                    is your selected default; check its catalog or send a
                    request to verify availability.
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
                  <span className="pill amber-pill">
                    {synthetic ? "SIMULATION ONLY" : "LAB NOT RUNNING"}
                  </span>
                  {synthetic && simulation && (
                    <SimulationResult data={simulation} />
                  )}
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
                    disabled={!COLLECTOR}
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
                    disabled={busy || !COLLECTOR}
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
                    {!COLLECTOR
                      ? "Analytics service not configured"
                      : core.analytics.opt_in
                        ? "Disable participation"
                        : "Enable participation"}
                  </button>
                  <button
                    className="primary full"
                    style={{ marginTop: 12 }}
                    disabled={busy || !core.analytics.opt_in || !COLLECTOR}
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
                  {globalError && global && (
                    <p className="error" role="status">
                      {globalError} Showing the last received snapshot.
                    </p>
                  )}
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
            <span className="footer-separator">/</span>MVP {appVersion}
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
            if (busy) return;
            setError("");
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
              disabled={busy}
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
                <p>Authorize memories for one model destination.</p>
                <label htmlFor="grant-destination">Destination</label>
                <select
                  id="grant-destination"
                  value={
                    grantDestination ||
                    activeProvider?.base_url ||
                    core.provider.base_url
                  }
                  onChange={(e) => setGrantDestination(e.target.value)}
                >
                  {(
                    admin?.providers.filter(
                      (item) => item.enabled && item.policy_allowed,
                    ) || []
                  ).map((item) => (
                    <option key={item.id} value={item.base_url}>
                      {item.label} · {item.base_url}
                    </option>
                  ))}
                  {!admin && (
                    <option value={core.provider.base_url}>
                      {core.provider.base_url}
                    </option>
                  )}
                </select>
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
                        destination:
                          grantDestination ||
                          activeProvider?.base_url ||
                          core.provider.base_url,
                        scope: grantScope,
                        expires_in_seconds: Number(grantDuration),
                      })
                    ) {
                      setGrantForm(false);
                      setToast("Scoped permission created.");
                    }
                  }}
                >
                  Authorize {grantScope.length}{" "}
                  {grantScope.length === 1 ? "memory" : "memories"}
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
                    <span>Source: {selected.source.replaceAll("_", " ")}</span>
                    <span>Updated {dateLabel(selected.updated_at)}</span>
                  </div>
                )}
                {deletePending && (
                  <p className="deletion-note" role="status">
                    This removes the memory and its history from this vault.
                    Copies previously shared cannot be recalled.
                  </p>
                )}
                <div className="modal-actions">
                  {selected ? (
                    <>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={async () => {
                          if (!deletePending) {
                            setDeletePending(true);
                            return;
                          }
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
                        {deletePending ? "Confirm deletion" : "Delete"}
                      </button>
                      {deletePending && (
                        <button
                          className="text-button"
                          onClick={() => setDeletePending(false)}
                        >
                          Keep memory
                        </button>
                      )}
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
      {captureOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busy) setCaptureOpen(false);
          }}
        >
          <section
            className="modal capture-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Import text"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close import"
              disabled={busy}
              onClick={() => setCaptureOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">FROM YOUR WORDS TO YOUR MEMORY</div>
            <h2>Keep what matters.</h2>
            <p>
              Paste a note or a conversation. Local extraction suggests memories
              for you to review. Nothing is approved for sharing automatically.
            </p>
            <label htmlFor="capture-title">Source title</label>
            <input
              id="capture-title"
              value={captureTitle}
              onChange={(event) => setCaptureTitle(event.target.value)}
              placeholder="For example: project notes"
              maxLength={200}
            />
            <label htmlFor="capture-content">Text to remember</label>
            <textarea
              id="capture-content"
              value={captureContent}
              onChange={(event) => setCaptureContent(event.target.value)}
              rows={8}
              placeholder="Paste the text you want to keep in your local vault…"
            />
            <div className="capture-footnote">
              <LockKeyhole size={14} />
              <span>
                Saved to this device. Processed by your local extraction model.
              </span>
            </div>
            <button
              className="primary full"
              disabled={
                busy || !captureContent.trim() || connection !== "online"
              }
              onClick={() => void capture()}
            >
              {busy ? "Preparing memories…" : "Extract for review"}
              <ArrowRight size={16} />
            </button>
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
              disabled={busy || !core.analytics.opt_in || !COLLECTOR}
              onClick={async () => {
                if (
                  await mutate("/api/analytics/send", "POST", {
                    week: report.week,
                  })
                ) {
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
      {setupOpen && (
        <Setup
          request={localRequest}
          admin={admin}
          core={core}
          onChanged={refreshAdministration}
          onClose={closeSetup}
          onAsk={() => {
            setChatProviderId("");
            setChatModel("");
            setGrantId("");
            resetConversation();
            setLauncher(true);
          }}
        />
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
                <span>{activeProvider?.model || "Choose a model"}</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setLauncher(false)}
                aria-label="Close launcher"
              >
                <X size={19} />
              </button>
            </header>
            <div className="chat-routing">
              <label>
                Provider
                <select
                  aria-label="Conversation provider"
                  value={
                    chatProviderId ||
                    admin?.settings.primary_provider_id ||
                    core.provider.id ||
                    "default"
                  }
                  disabled={chatBusy || !admin}
                  onChange={(e) => {
                    setChatProviderId(e.target.value);
                    setChatModel("");
                  }}
                >
                  {admin ? (
                    admin.providers
                      .filter((item) => item.enabled && item.policy_allowed)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                          {item.id === admin.settings.primary_provider_id
                            ? " · Default"
                            : ""}
                        </option>
                      ))
                  ) : (
                    <option value={core.provider.id || "default"}>
                      {core.provider.model}
                    </option>
                  )}
                </select>
              </label>
              <label>
                Model
                <select
                  aria-label="Conversation model"
                  value={activeProvider?.model || ""}
                  disabled={chatBusy || !selectedProvider}
                  onChange={(e) => setChatModel(e.target.value)}
                >
                  {!activeProvider?.model && (
                    <option value="" disabled>
                      Choose a model
                    </option>
                  )}
                  {[
                    ...new Set(
                      [
                        selectedProvider
                          ? selectedProvider.model
                          : core.provider.model,
                        ...(selectedProvider?.models || []),
                        chatModel,
                      ].filter(Boolean),
                    ),
                  ].map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="icon-button"
                title="Manage model connections"
                aria-label="Manage model connections"
                onClick={() => {
                  setLauncher(false);
                  setView("models");
                }}
              >
                <Settings2 size={17} />
              </button>
            </div>
            <div
              className="chat-history"
              ref={historyElement}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              {chat.length ? (
                chat.map((entry, i) => (
                  <article key={i} className={`chat-entry ${entry.role}`}>
                    <div className="chat-entry-heading">
                      {entry.role === "user" ? (
                        <Fingerprint size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      <strong>
                        {entry.role === "user" ? "You" : entry.model || "Model"}
                      </strong>
                    </div>
                    {entry.role === "assistant" ? (
                      <>
                        <div className="markdown-body">
                          <Markdown
                            remarkPlugins={[remarkGfm]}
                            skipHtml
                            components={{
                              img: ({ alt }) => (
                                <span className="image-omitted">
                                  [Image: {alt || "not loaded automatically"}]
                                </span>
                              ),
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {entry.text}
                          </Markdown>
                        </div>
                        <div className="response-actions">
                          <CopyReply text={entry.text} />
                          {entry.receiptId && (
                            <span>
                              <ShieldCheck size={12} /> Context receipt recorded
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p>{entry.text}</p>
                        {!!entry.attachments?.length && (
                          <div className="file-attachments">
                            {entry.attachments.map((file, index) => (
                              <span key={index}>
                                <FileText size={13} />
                                {file.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
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
                  <div
                    className="conversation-starters"
                    aria-label="Conversation starters"
                  >
                    {[
                      "Help me plan my next project.",
                      "Explain an idea, step by step.",
                      "Help me think through a decision.",
                    ].map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => {
                          setMessage(starter);
                          document
                            .querySelector<HTMLTextAreaElement>(
                              '[aria-label="Your message"]',
                            )
                            ?.focus();
                        }}
                      >
                        {starter}
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
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
            <div className="conversation-note">
              {chat.length
                ? "Up to 10 previous exchanges accompany your next message. Changing permission starts a new conversation."
                : "Conversation stays in this session. Only the selected context is shared."}
            </div>
            <form onSubmit={send}>
              <div className="context-selector">
                <Shield size={14} />
                <select
                  aria-label="Permission for context"
                  value={grantId}
                  disabled={chatBusy}
                  onChange={(e) => {
                    setGrantId(e.target.value);
                    resetConversation();
                  }}
                >
                  <option value="">No memory context</option>
                  {activeGrants
                    .filter((g) => g.destination === activeProvider?.base_url)
                    .map((g) => (
                      <option value={g.id} key={g.id}>
                        {g.scope.includes("*")
                          ? "All"
                          : `Up to ${g.scope.length}`}{" "}
                        confirmed{" "}
                        {g.scope.length === 1 && !g.scope.includes("*")
                          ? "memory"
                          : "memories"}{" "}
                        · expires {dateLabel(g.expires_at)}
                      </option>
                    ))}
                </select>
                <LockKeyhole size={13} />
                <span>
                  {activeProvider?.local
                    ? "Local destination"
                    : "External destination"}
                </span>
              </div>
              <div className="file-attachments">
                {attachments.map((file, index) => (
                  <span key={index}>
                    <FileText size={13} />
                    {file.name}
                    <button
                      type="button"
                      aria-label={`Remove attached file ${index + 1}`}
                      disabled={chatBusy || readingFiles}
                      onClick={() =>
                        setAttachments((value) =>
                          value.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              <label className="attach-control">
                <FileText size={14} />
                {readingFiles ? "Reading files…" : "Attach text files"}
                <input
                  type="file"
                  aria-label="Attach text files"
                  multiple
                  accept=".txt,.md,.csv,.json,.log,.yaml,.yml"
                  disabled={chatBusy || readingFiles}
                  onChange={async (event) => {
                    const selected = event.target.files
                      ? Array.from(event.target.files)
                      : [];
                    event.target.value = "";
                    if (!selected.length) return;
                    const epoch = ++attachmentEpoch.current;
                    setReadingFiles(true);
                    try {
                      if (attachments.length + selected.length > 8)
                        throw new Error(
                          "Attach at most eight files. Your policy may set a lower limit.",
                        );
                      const values = await readTextFiles(selected);
                      if (
                        !sessionController.current.signal.aborted &&
                        epoch === attachmentEpoch.current
                      )
                        setAttachments((current) => [...current, ...values]);
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      if (epoch === attachmentEpoch.current)
                        setReadingFiles(false);
                    }
                  }}
                />
              </label>
              <div className="composer">
                <textarea
                  autoFocus
                  rows={2}
                  aria-label="Your message"
                  placeholder="What are you working on?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      if (message.trim() && !chatBusy)
                        e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {chatBusy ? (
                  <button
                    type="button"
                    className="send-button stop-button"
                    aria-label="Stop waiting"
                    onClick={() => chatController.current?.abort()}
                  >
                    <Square size={15} />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    disabled={
                      !message.trim() ||
                      readingFiles ||
                      connection !== "online" ||
                      !activeProvider?.model
                    }
                    aria-label="Send message"
                  >
                    <Send size={17} />
                  </button>
                )}
              </div>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <span>Enter to send · Shift + Enter for a new line</span>
              <button
                className="text-button"
                type="button"
                disabled={chatBusy || !chat.length}
                onClick={resetConversation}
              >
                <RotateCcw size={12} />
                New conversation
              </button>
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

function CopyReply({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setFailed(false);
        } catch {
          setFailed(true);
        }
      }}
      aria-label="Copy response"
    >
      {copied ? <CheckCheck size={13} /> : <Copy size={13} />}{" "}
      {copied ? "Copied" : failed ? "Select text to copy" : "Copy response"}
    </button>
  );
}
