import { isMobileDevice } from "./native";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Cpu,
  ExternalLink,
  Fingerprint,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  AdminState,
  ProviderKind,
  ProviderProfile,
} from "./Administration";
import type { CoreState, Memory } from "./api";
import "./setup.css";

interface SetupProps {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  admin: AdminState | null;
  core: CoreState;
  onChanged: () => Promise<void>;
  onClose: () => void;
  onAsk: () => void;
}

type ConnectionKind = Extract<ProviderKind, "ollama" | "openai" | "anthropic">;
const connectionKinds: Record<
  ConnectionKind,
  { label: string; name: string; base: string; caption: string }
> = {
  ollama: {
    label: "Local Ollama",
    name: "Ollama",
    base: "http://127.0.0.1:11434/v1",
    caption: "On your device",
  },
  openai: {
    label: "OpenAI",
    name: "OpenAI",
    base: "https://api.openai.com/v1",
    caption: "Your API key",
  },
  anthropic: {
    label: "Claude",
    name: "Anthropic",
    base: "https://api.anthropic.com/v1",
    caption: "Your API key",
  },
};
const steps = ["Connect", "Remember", "Ready"];
const titles = [
  "Make yourself at home.",
  "A little context. Yours to keep.",
  "Your space is ready.",
];
const descriptions = [
  "Choose where your conversations go. Your local vault stays here.",
  "Start with one preference, or let your memory grow later.",
  "A model you chose. Memory under your control. Start when you’re ready.",
];

function loopback(base: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname);
  } catch {
    return false;
  }
}

function connectionStatus(provider: ProviderProfile) {
  if (provider.policy_allowed === false)
    return "Blocked by installation policy";
  if (provider.status === "available") return "Connection checked";
  if (provider.status === "auth_error") return "Credentials need attention";
  if (provider.status === "unavailable") return "Could not connect";
  return "Not checked yet";
}

export default function Setup({
  request,
  admin,
  core,
  onChanged,
  onClose,
  onAsk,
}: SetupProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const controller = useRef(new AbortController());
  const pendingRef = useRef(false);
  const initializedProvider = useRef("");
  const [data, setData] = useState(admin);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState("");
  const [issue, setIssue] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState(
    admin?.settings.primary_provider_id || core.provider.id || "",
  );
  const [adding, setAdding] = useState(false);
  const mobile = isMobileDevice();
  const initialKind: ConnectionKind = mobile ? "openai" : "ollama";
  const [kind, setKind] = useState<ConnectionKind>(initialKind);
  const [label, setLabel] = useState(connectionKinds[initialKind].label);
  const [base, setBase] = useState(connectionKinds[initialKind].base);
  const [apiKey, setApiKey] = useState("");
  const [replacementKey, setReplacementKey] = useState("");
  const [model, setModel] = useState("");
  const [manualModel, setManualModel] = useState(false);
  const [connected, setConnected] = useState<ProviderProfile | null>(null);
  const [preference, setPreference] = useState("");
  const [savedMemory, setSavedMemory] = useState<Memory | null>(null);

  const eligible = data?.providers.filter((provider) => provider.enabled) || [];
  const selected = eligible.find((provider) => provider.id === selectedId);
  const busy = !!pending;
  const canContinue = !!(
    selected &&
    selected.policy_allowed !== false &&
    selected.status === "available" &&
    model.trim() &&
    (!selected.models.length ||
      manualModel ||
      selected.models.includes(model)) &&
    !adding
  );
  const simulation = core.stats.simulation || core.simulation;

  useEffect(() => {
    if (admin) setData(admin);
  }, [admin]);

  useEffect(() => {
    if (!data || eligible.some((provider) => provider.id === selectedId))
      return;
    setSelectedId(
      eligible.find(
        (provider) => provider.id === data.settings.primary_provider_id,
      )?.id ||
        eligible.find((provider) => provider.policy_allowed !== false)?.id ||
        eligible[0]?.id ||
        "",
    );
  }, [data, selectedId]);

  useEffect(() => {
    if (!selected || initializedProvider.current === selected.id) return;
    initializedProvider.current = selected.id;
    setModel(selected.model);
    setManualModel(
      !selected.models.length ||
        (!!selected.model && !selected.models.includes(selected.model)),
    );
    setReplacementKey("");
  }, [selected]);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    const lifecycle = new AbortController();
    controller.current = lifecycle;
    mounted.current = true;
    document.body.style.overflow = "hidden";
    if (element && !element.open) element.showModal();
    if (!admin) {
      void request<AdminState>("/api/admin", {
        signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(30000)]),
      })
        .then((value) => {
          if (!lifecycle.signal.aborted) setData(value);
        })
        .catch((error: unknown) => {
          if (!lifecycle.signal.aborted)
            setIssue(
              error instanceof Error
                ? error.message
                : "Could not load your connections.",
            );
        });
    }
    return () => {
      mounted.current = false;
      lifecycle.abort();
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    scrollArea.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      element.style.setProperty("--setup-viewport-height", `${height}px`);
      element.style.setProperty(
        "--setup-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
      element.dataset.compactViewport = String(height < 520);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (
          (active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement ||
            active instanceof HTMLSelectElement) &&
          scrollArea.current?.contains(active)
        )
          active.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const localRequest = <T,>(path: string, options: RequestInit = {}) =>
    request<T>(path, {
      ...options,
      signal: AbortSignal.any([
        controller.current.signal,
        AbortSignal.timeout(30000),
      ]),
    });

  const updateProfile = (profile: ProviderProfile) => {
    if (!mounted.current) return;
    setData((previous) =>
      previous
        ? {
            ...previous,
            providers: previous.providers.some((item) => item.id === profile.id)
              ? previous.providers.map((item) =>
                  item.id === profile.id ? profile : item,
                )
              : [...previous.providers, profile],
          }
        : previous,
    );
  };

  const refreshSpace = async () => {
    try {
      await onChanged();
    } catch {
      if (mounted.current)
        setNotice(
          "Saved locally. Refresh your space if the change does not appear yet.",
        );
    }
  };

  const act = async (name: string, task: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(name);
    setIssue("");
    setNotice("");
    try {
      await task();
    } catch (error) {
      if (mounted.current && !controller.current.signal.aborted)
        setIssue(
          error instanceof Error
            ? error.message
            : "This action could not be completed. Please try again.",
        );
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending("");
    }
  };

  const reload = () =>
    act("reload", async () => {
      const value = await localRequest<AdminState>("/api/admin");
      if (mounted.current) {
        setData(value);
        setNotice("Your saved connections are up to date.");
      }
    });

  const changeKind = (next: ConnectionKind) => {
    setKind(next);
    setLabel(connectionKinds[next].label);
    setBase(connectionKinds[next].base);
    setApiKey("");
    setIssue("");
  };

  const saveConnection = (event: FormEvent) => {
    event.preventDefault();
    void act("create", async () => {
      const profile = await localRequest<ProviderProfile>("/api/providers", {
        method: "POST",
        body: JSON.stringify({
          label: label.trim(),
          kind,
          base_url: base.trim(),
          model: "",
          enabled: true,
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        }),
      });
      if (!mounted.current) return;
      setApiKey("");
      updateProfile(profile);
      setSelectedId(profile.id);
      setAdding(false);
      setNotice("Connection saved. Check it to discover the available models.");
      await refreshSpace();
    });
  };

  const checkConnection = () => {
    if (!selected) return;
    void act("probe", async () => {
      const profile = await localRequest<ProviderProfile>(
        `/api/providers/${selected.id}/probe`,
        { method: "POST", body: "{}" },
      );
      if (!mounted.current) return;
      updateProfile(profile);
      if (profile.models.length && (!model || profile.models.includes(model)))
        setManualModel(false);
      if (profile.status === "available")
        setNotice(
          profile.models.length
            ? "Connection reached. Choose a model below; no test conversation was sent."
            : "Connection reached, but its catalog is empty. Install a model or enter a model ID you can access.",
        );
      await refreshSpace();
    });
  };

  const saveCredential = () => {
    if (!selected || !replacementKey.trim()) return;
    void act("credential", async () => {
      const profile = await localRequest<ProviderProfile>(
        `/api/providers/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ api_key: replacementKey.trim() }),
        },
      );
      if (!mounted.current) return;
      setReplacementKey("");
      updateProfile(profile);
      setNotice(
        "API key saved in your local vault. Check the connection again.",
      );
      await refreshSpace();
    });
  };

  const continueConnection = () => {
    if (!canContinue || !selected) return;
    void act("connect", async () => {
      let profile = selected;
      if (model.trim() !== profile.model) {
        profile = await localRequest<ProviderProfile>(
          `/api/providers/${profile.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ model: model.trim() }),
          },
        );
        updateProfile(profile);
      }
      if (profile.id !== data?.settings.primary_provider_id) {
        await localRequest("/api/admin/settings", {
          method: "PATCH",
          body: JSON.stringify({ primary_provider_id: profile.id }),
        });
        if (mounted.current)
          setData((previous) =>
            previous
              ? {
                  ...previous,
                  settings: {
                    ...previous.settings,
                    primary_provider_id: profile.id,
                  },
                }
              : previous,
          );
      }
      if (!mounted.current) return;
      setConnected(profile);
      await refreshSpace();
      if (mounted.current) {
        setNotice("");
        setStep(1);
      }
    });
  };

  const savePreference = () => {
    if (!preference.trim() || savedMemory) return;
    void act("memory", async () => {
      const memory = await localRequest<Memory>("/api/memories", {
        method: "POST",
        body: JSON.stringify({
          content: preference.trim(),
          status: "confirmed",
          source: "manual",
        }),
      });
      if (!mounted.current) return;
      setSavedMemory(memory);
      await refreshSpace();
      if (mounted.current) {
        setNotice("");
        setStep(2);
      }
    });
  };

  const goBack = () => {
    setIssue("");
    setNotice("");
    setStep((current) => Math.max(0, current - 1));
  };

  const openOllama = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    event.preventDefault();
    void import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke<void>("open_setup_resource", { resource: "ollama" }),
      )
      .catch(() => {
        if (mounted.current)
          setIssue(
            "Could not open your browser. Open https://ollama.com/download manually, then return here to check the connection.",
          );
      });
  };

  const credentialFields = selected && (
    <div className="setup-credential">
      <div className="setup-field">
        <label htmlFor={`${id}-replacement-key`}>
          API key for {selected.label}
        </label>
        <input
          id={`${id}-replacement-key`}
          type="password"
          autoComplete="new-password"
          value={replacementKey}
          onChange={(event) => setReplacementKey(event.target.value)}
          disabled={busy}
          placeholder="Enter a key to save locally"
        />
      </div>
      <button
        className="setup-secondary"
        disabled={busy || !replacementKey.trim()}
        onClick={saveCredential}
      >
        <KeyRound size={14} />
        {pending === "credential" ? "Saving…" : "Save API key"}
      </button>
      <small>
        Saved keys are encrypted in your local vault and never shown back here.
      </small>
    </div>
  );

  return (
    <dialog
      ref={dialog}
      className="setup-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="setup-shell" aria-busy={busy}>
        <header className="setup-chrome">
          <div className="setup-brand">
            <Fingerprint size={21} />
            <span>Your personal space</span>
          </div>
          <button
            className="setup-close"
            aria-label="Close setup"
            onClick={onClose}
            disabled={busy}
          >
            <X size={19} />
          </button>
        </header>
        <ol className="setup-progress" aria-label="Setup progress">
          {steps.map((name, index) => (
            <li
              key={name}
              className={
                index === step ? "current" : index < step ? "complete" : ""
              }
              aria-current={index === step ? "step" : undefined}
            >
              <span className="setup-step-marker">
                {index < step ? <Check size={13} /> : index + 1}
              </span>
              <span>{name}</span>
              {index === 1 && <small>Optional</small>}
            </li>
          ))}
        </ol>
        <div className="setup-scroll" ref={scrollArea}>
          <div className="setup-heading">
            <span className="setup-eyebrow">
              A SPACE THAT STARTS WITH YOU · {step + 1} / 3
            </span>
            <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>
              {titles[step]}
            </h2>
            <p id={`${id}-description`}>{descriptions[step]}</p>
          </div>
          {simulation && (
            <p className="setup-simulation">
              Synthetic demonstration · these connections may point to local
              test providers.
            </p>
          )}
          {issue && (
            <div className="setup-feedback setup-failure" role="alert">
              <div>
                <strong>Let’s get this connected.</strong>
                <p>{issue}</p>
              </div>
              <button
                className="setup-text"
                disabled={busy}
                onClick={() => void reload()}
              >
                <RefreshCw size={13} /> Refresh connections
              </button>
            </div>
          )}
          {notice && (
            <p className="setup-feedback setup-notice" role="status">
              <CheckCircle2 size={16} />
              <span>{notice}</span>
            </p>
          )}

          {step === 0 && !data && (
            <div className="setup-loading">
              {issue ? (
                <Cpu size={28} />
              ) : (
                <LoaderCircle size={28} className="setup-spin" />
              )}
              <strong>
                {issue
                  ? "Your connections are not available yet."
                  : "Opening your connections…"}
              </strong>
              <p>
                You can retry, or explore your space and connect a model later.
              </p>
              <button
                className="setup-secondary"
                disabled={busy}
                onClick={() => void reload()}
              >
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          )}

          {step === 0 && data && (
            <div className="setup-connect">
              {!adding && eligible.length > 0 && (
                <>
                  <div className="setup-field">
                    <label htmlFor={`${id}-connection`}>Your connection</label>
                    <div className="setup-connection-picker">
                      <select
                        id={`${id}-connection`}
                        value={selectedId}
                        disabled={busy}
                        onChange={(event) => {
                          setSelectedId(event.target.value);
                          setIssue("");
                          setNotice("");
                        }}
                      >
                        {eligible.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                            {provider.id === data.settings.primary_provider_id
                              ? " · Default"
                              : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="setup-secondary"
                        disabled={busy}
                        onClick={() => {
                          setAdding(true);
                          setIssue("");
                          setNotice("");
                        }}
                      >
                        <Plus size={15} />
                        Add new
                      </button>
                    </div>
                  </div>
                  {selected && (
                    <>
                      <section
                        className="setup-connection-card"
                        aria-label="Connection details"
                      >
                        <div className="setup-connection-line">
                          <span className="setup-provider-icon">
                            {loopback(selected.base_url) ? (
                              <Cpu size={22} />
                            ) : (
                              <Globe2 size={22} />
                            )}
                          </span>
                          <div>
                            <strong>{selected.label}</strong>
                            <span>
                              {loopback(selected.base_url)
                                ? "A local endpoint on this device"
                                : "Requests go to this provider"}
                            </span>
                          </div>
                          <span
                            className={`setup-connection-status ${selected.status === "available" && selected.policy_allowed !== false ? "checked" : ""}`}
                          >
                            {selected.status === "available" &&
                            selected.policy_allowed !== false ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <Circle size={10} />
                            )}
                            {connectionStatus(selected)}
                          </span>
                        </div>
                        <code className="setup-endpoint">
                          {selected.base_url}
                        </code>
                        <div className="setup-probe-row">
                          <p>
                            Check the model catalog. No prompt is sent and no
                            model is downloaded.
                          </p>
                          <button
                            className="setup-secondary"
                            onClick={checkConnection}
                            disabled={busy || selected.policy_allowed === false}
                          >
                            {pending === "probe" ? (
                              <LoaderCircle className="setup-spin" size={15} />
                            ) : (
                              <RefreshCw size={15} />
                            )}
                            {pending === "probe"
                              ? "Checking…"
                              : selected.status === "unavailable" ||
                                  selected.status === "auth_error"
                                ? "Try connection again"
                                : "Check connection"}
                          </button>
                        </div>
                      </section>
                      {selected.policy_allowed === false && (
                        <div className="setup-connection-help">
                          <strong>
                            This endpoint is blocked by your installation
                            policy.
                          </strong>
                          <p>
                            The connection was saved, but OMNI cannot send
                            requests to it. Choose another connection, or review
                            the installation policy in Settings.
                          </p>
                        </div>
                      )}
                      {(selected.status === "unavailable" ||
                        selected.status === "auth_error") && (
                        <div className="setup-connection-help">
                          <strong>
                            {selected.status === "auth_error"
                              ? "The provider did not accept this connection."
                              : selected.kind === "ollama"
                                ? "Ollama needs to be running with a model installed."
                                : "The provider could not be reached."}
                          </strong>
                          {selected.kind === "ollama" && !mobile ? (
                            <ol>
                              <li>Install and open Ollama on this device.</li>
                              <li>Choose and download a model in Ollama.</li>
                              <li>
                                Return here and check the connection again.
                              </li>
                            </ol>
                          ) : (
                            <p>
                              Check the endpoint and your API key, then try the
                              connection again. You can also add another
                              connection.
                            </p>
                          )}
                          {selected.kind === "ollama" && !mobile && (
                            <a
                              href="https://ollama.com/download"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={openOllama}
                            >
                              Get Ollama <ExternalLink size={12} />
                            </a>
                          )}
                          {selected.error && (
                            <details>
                              <summary>
                                Connection details <ChevronDown size={12} />
                              </summary>
                              <p>{selected.error}</p>
                            </details>
                          )}
                        </div>
                      )}
                      {loopback(selected.base_url) ? (
                        <details
                          className="setup-authentication"
                          open={selected.status === "auth_error" || undefined}
                        >
                          <summary>
                            Authentication (optional)
                            <ChevronDown size={14} />
                          </summary>
                          {credentialFields}
                        </details>
                      ) : selected.status === "auth_error" ||
                        !selected.has_api_key ? (
                        credentialFields
                      ) : null}
                      <div className="setup-model-field">
                        <div className="setup-field-top">
                          <label htmlFor={`${id}-model`}>
                            Choose your model
                          </label>
                          {selected.models.length > 0 && (
                            <button
                              type="button"
                              className="setup-text"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  manualModel &&
                                  !selected.models.includes(model)
                                )
                                  setModel("");
                                setManualModel((value) => !value);
                              }}
                            >
                              {manualModel
                                ? "Choose from catalog"
                                : "Enter an ID instead"}
                            </button>
                          )}
                        </div>
                        {selected.models.length > 0 && !manualModel ? (
                          <select
                            id={`${id}-model`}
                            value={selected.models.includes(model) ? model : ""}
                            disabled={busy}
                            onChange={(event) => setModel(event.target.value)}
                          >
                            <option value="" disabled>
                              Choose a model
                            </option>
                            {selected.models.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`${id}-model`}
                            value={model}
                            onChange={(event) => setModel(event.target.value)}
                            disabled={busy}
                            maxLength={200}
                            autoComplete="off"
                            placeholder={
                              selected.status === "available"
                                ? "Enter an exact model ID"
                                : "Check the connection to discover models"
                            }
                          />
                        )}
                        <small>
                          {selected.models.length > 0 && !manualModel
                            ? "These IDs were returned by this connection. Choose the model you want to use."
                            : "An entered ID is not an availability check. Your first conversation will use this exact model."}
                        </small>
                        {!!selected.rates &&
                          model.trim() !== selected.model && (
                            <p className="setup-rate-note">
                              Changing the model clears its old cost estimates.
                              You can set new rates in Models.
                            </p>
                          )}
                      </div>
                    </>
                  )}
                </>
              )}
              {!adding && eligible.length === 0 && (
                <div className="setup-no-connection">
                  <span className="setup-provider-icon">
                    <Cpu size={26} />
                  </span>
                  <h3>Give your space a model.</h3>
                  <p>
                    {mobile
                      ? "Use your own provider API key. You can add a trusted remote model endpoint in Models later."
                      : "Connect Ollama on this device, or use your own provider API key."}
                  </p>
                  <button
                    className="setup-primary"
                    disabled={busy}
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={16} />
                    Add your first connection
                  </button>
                  {data.providers.length > 0 && (
                    <small>
                      Your saved profiles are disabled. You can review them in
                      Models.
                    </small>
                  )}
                </div>
              )}
              {adding && (
                <form
                  onSubmit={saveConnection}
                  className="setup-new-connection"
                >
                  <div className="setup-section-label">
                    <strong>A new connection</strong>
                    {eligible.length > 0 && (
                      <button
                        type="button"
                        className="setup-text"
                        disabled={busy}
                        onClick={() => {
                          setAdding(false);
                          setApiKey("");
                          setIssue("");
                        }}
                      >
                        Use an existing connection
                      </button>
                    )}
                  </div>
                  <div
                    className="setup-kind-grid"
                    role="group"
                    aria-label="New connection type"
                  >
                    {(Object.keys(connectionKinds) as ConnectionKind[])
                      .filter((item) => !mobile || item !== "ollama")
                      .map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={item === kind ? "selected" : ""}
                          aria-pressed={item === kind}
                          disabled={busy}
                          onClick={() => changeKind(item)}
                        >
                          {item === "ollama" ? (
                            <Cpu size={21} />
                          ) : (
                            <Globe2 size={21} />
                          )}
                          <strong>{connectionKinds[item].name}</strong>
                          <span>{connectionKinds[item].caption}</span>
                          {item === kind && (
                            <Check className="setup-kind-check" size={13} />
                          )}
                        </button>
                      ))}
                  </div>
                  <div className="setup-field">
                    <label htmlFor={`${id}-name`}>Connection name</label>
                    <input
                      id={`${id}-name`}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      maxLength={80}
                      required
                      disabled={busy}
                      autoComplete="off"
                    />
                  </div>
                  {kind !== "ollama" && (
                    <div className="setup-field">
                      <label htmlFor={`${id}-key`}>Your API key</label>
                      <input
                        id={`${id}-key`}
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        autoComplete="new-password"
                        disabled={busy}
                        placeholder="Paste your provider API key"
                      />
                      <small>
                        Encrypted in your local vault. OMNI uses it only with
                        this provider.
                      </small>
                    </div>
                  )}
                  {kind === "ollama" && (
                    <p className="setup-local-note">
                      <Cpu size={16} />
                      <span>
                        Ollama must already be running with a model installed.{" "}
                        <a
                          href="https://ollama.com/download"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={openOllama}
                        >
                          Get Ollama <ExternalLink size={11} />
                        </a>
                      </span>
                    </p>
                  )}
                  <details className="setup-endpoint-settings">
                    <summary>
                      Connection details <ChevronDown size={14} />
                    </summary>
                    <div className="setup-field">
                      <label htmlFor={`${id}-endpoint`}>API base URL</label>
                      <input
                        id={`${id}-endpoint`}
                        type="url"
                        value={base}
                        onChange={(event) => setBase(event.target.value)}
                        required
                        disabled={busy}
                        autoComplete="off"
                      />
                      <small>
                        {kind === "ollama"
                          ? "The default points to Ollama on this device."
                          : "Your API key will be used with this exact endpoint. Use a provider you trust."}
                      </small>
                    </div>
                  </details>
                  <div className="setup-save-row">
                    <span>
                      <LockKeyhole size={13} />
                      Connection settings stay in your local vault.
                    </span>
                    <button
                      type="submit"
                      className="setup-primary"
                      disabled={busy || !label.trim() || !base.trim()}
                    >
                      {pending === "create" ? (
                        <LoaderCircle className="setup-spin" size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      {pending === "create" ? "Saving…" : "Save connection"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="setup-remember">
              <div className="setup-memory-illustration" aria-hidden="true">
                <span />
                <span />
                <span />
                <Fingerprint size={35} />
              </div>
              {savedMemory ? (
                <div className="setup-saved-memory">
                  <span>
                    <CheckCircle2 size={16} />
                    Confirmed preference saved
                  </span>
                  <p>{savedMemory.content}</p>
                  <small>You can edit or remove it in Memory.</small>
                </div>
              ) : (
                <div className="setup-field">
                  <label htmlFor={`${id}-preference`}>
                    A preference worth remembering
                  </label>
                  <textarea
                    id={`${id}-preference`}
                    value={preference}
                    onChange={(event) => setPreference(event.target.value)}
                    disabled={busy}
                    rows={4}
                    maxLength={2000}
                    placeholder="For example: I prefer concise answers with links to original sources."
                  />
                  <div className="setup-memory-hint">
                    <small>
                      Saving marks your own words as a confirmed memory.
                    </small>
                    <span>{preference.length.toLocaleString()} / 2,000</span>
                  </div>
                </div>
              )}
              <div className="setup-privacy-note">
                <ShieldCheck size={21} />
                <div>
                  <strong>Remembering is not sharing.</strong>
                  <p>
                    Saving this preference does not send it to a model. Sharing
                    is controlled by your permissions; setup creates none.
                  </p>
                </div>
              </div>
              {!savedMemory && core.memories.length > 0 && (
                <p className="setup-existing-memories">
                  Your vault already contains{" "}
                  {core.memories.length.toLocaleString()}{" "}
                  {core.memories.length === 1 ? "memory" : "memories"}. This
                  step is optional.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="setup-ready">
              <div className="setup-ready-mark" aria-hidden="true">
                <Check size={31} />
              </div>
              <div className="setup-ready-list">
                <div>
                  <span className="setup-ready-icon">
                    <Cpu size={18} />
                  </span>
                  <span>
                    <strong>
                      {connected?.label || "Your chosen connection"}
                    </strong>
                    <small>{connected?.model || "Model configured"}</small>
                  </span>
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <span className="setup-ready-icon">
                    <Fingerprint size={18} />
                  </span>
                  <span>
                    <strong>
                      {savedMemory
                        ? "One preference, saved locally"
                        : "Memory can grow at your pace"}
                    </strong>
                    <small>
                      {savedMemory
                        ? "Confirmed by you · editable in Memory"
                        : "Add a preference or review an import whenever you’re ready"}
                    </small>
                  </span>
                  {savedMemory ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Circle size={12} />
                  )}
                </div>
                <div>
                  <span className="setup-ready-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <span>
                    <strong>You decide what is shared</strong>
                    <small>
                      Memory requires a permission · setup added no permissions
                    </small>
                  </span>
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <p className="setup-ready-note">
                The connection was checked through its catalog. No test prompt
                was sent. Your next click opens the conversation; it does not
                send a message.
              </p>
            </div>
          )}
        </div>
        <footer className="setup-footer">
          <div className="setup-footer-start">
            {step > 0 && (
              <button
                className="setup-text setup-back"
                disabled={busy}
                onClick={goBack}
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
            <button
              className="setup-text setup-skip"
              disabled={busy}
              onClick={onClose}
            >
              {step === 2 ? "Explore my space" : "Skip setup"}
            </button>
          </div>
          {step === 0 && (
            <div className="setup-next">
              <span>
                {adding
                  ? "Save, then check your connection."
                  : !selected
                    ? "Connect a provider to continue."
                    : selected.policy_allowed === false
                      ? "Choose an allowed connection."
                      : selected.status !== "available"
                        ? "Check your connection first."
                        : !model.trim()
                          ? "Choose a model to continue."
                          : "Use this as your default connection."}
              </span>
              <button
                className="setup-primary"
                disabled={busy || !canContinue}
                onClick={continueConnection}
              >
                {pending === "connect" ? (
                  <LoaderCircle className="setup-spin" size={16} />
                ) : null}
                {pending === "connect" ? "Saving…" : "Continue"}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {step === 1 && (
            <div className="setup-memory-actions">
              {!savedMemory && (
                <button
                  className="setup-secondary"
                  disabled={busy}
                  onClick={() => {
                    setIssue("");
                    setNotice("");
                    setStep(2);
                  }}
                >
                  Not now
                </button>
              )}
              <button
                className="setup-primary"
                disabled={busy || (!savedMemory && !preference.trim())}
                onClick={savedMemory ? () => setStep(2) : savePreference}
              >
                {pending === "memory" ? (
                  <LoaderCircle className="setup-spin" size={16} />
                ) : null}
                {pending === "memory"
                  ? "Saving…"
                  : savedMemory
                    ? "Continue"
                    : "Save preference"}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {step === 2 && (
            <button
              className="setup-primary setup-finish"
              onClick={() => {
                onClose();
                onAsk();
              }}
            >
              <MessageSquare size={16} />
              Open your first conversation
              <ArrowRight size={15} />
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
