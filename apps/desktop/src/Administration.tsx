import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  Cpu,
  Download,
  Globe2,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { dateLabel } from "./api";
import "./administration.css";

export type ProviderKind = "ollama" | "openai" | "anthropic" | "compatible";
export interface ProviderRates {
  input_per_million: number;
  output_per_million: number;
  cached_input_per_million?: number | null;
  cache_write_input_per_million?: number | null;
  currency: "USD";
}
export interface ProviderProfile {
  id: string;
  label: string;
  kind: ProviderKind;
  base_url: string;
  model: string;
  enabled: boolean;
  has_api_key: boolean;
  rates: ProviderRates | null;
  status: "available" | "unavailable" | "not_checked" | "auth_error";
  checked_at: string | null;
  models: string[];
  loaded_models:
    { name: string; size_bytes?: number; expires_at?: string }[] | null;
  error: string | null;
  policy_allowed?: boolean;
}
export interface AdminSettings {
  history_enabled: boolean;
  history_retention_days: number;
  extractor_base: string;
  extractor_model: string;
  primary_provider_id: string;
}
export interface AdminState {
  settings: AdminSettings;
  providers: ProviderProfile[];
  runtime: {
    version?: string;
    listen_address?: string;
    core_address?: string;
    key_storage: string;
    socks_proxy_configured: boolean;
    socks_proxy?: string | null;
    vpn_required: boolean;
    simulation: boolean;
    network_policy_read_only: boolean;
    analytics_url?: string;
    upstream_allowlist?: string[];
    upstream_allowlist_enforced?: boolean;
  };
}
type LocalRequest = <T>(path: string, options?: RequestInit) => Promise<T>;
interface Props {
  view: "models" | "settings";
  data: AdminState | null;
  error: string;
  request: LocalRequest;
  reload: () => Promise<void>;
  onChanged: () => Promise<void>;
  analyticsEnabled: boolean;
  green: boolean;
  onGreen: (enabled: boolean) => void;
}
const kinds: Record<
  ProviderKind,
  { name: string; letter: string; description: string }
> = {
  ollama: {
    name: "Ollama",
    letter: "◉",
    description: "Models hosted on your device",
  },
  openai: { name: "OpenAI", letter: "O", description: "OpenAI API connection" },
  anthropic: {
    name: "Anthropic",
    letter: "A",
    description: "Claude API connection",
  },
  compatible: {
    name: "Compatible API",
    letter: "↗",
    description: "OpenAI-compatible endpoint",
  },
};
const presets: Record<
  ProviderKind,
  { label: string; base_url: string; model: string }
> = {
  ollama: {
    label: "Local Ollama",
    base_url: "http://127.0.0.1:11434/v1",
    model: "",
  },
  openai: { label: "OpenAI", base_url: "https://api.openai.com/v1", model: "" },
  anthropic: {
    label: "Claude",
    base_url: "https://api.anthropic.com/v1",
    model: "",
  },
  compatible: { label: "Custom provider", base_url: "", model: "" },
};
const bytes = (value: number) =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(value / 1024 ** 2)} MB`;
const statusLabel = (provider: ProviderProfile) =>
  !provider.enabled
    ? "Disabled"
    : provider.policy_allowed === false
      ? "Policy blocked"
      : {
          available: "Available",
          unavailable: "Unavailable",
          not_checked: "Not checked",
          auth_error: "Check credentials",
        }[provider.status] || "Not checked";

function Dialog({
  title,
  children,
  busy,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="admin-dialog-inner"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">LOCAL ADMINISTRATION</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close settings dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export default function Administration(props: Props) {
  const { data, view, request, reload, onChanged } = props;
  const [editing, setEditing] = useState<ProviderProfile | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProviderProfile | null>(null);
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [catalog, setCatalog] = useState("");
  const act = async (
    key: string,
    task: () => Promise<unknown>,
    success: string,
  ) => {
    if (pending) return false;
    setPending(key);
    setFailure("");
    setNotice("");
    try {
      await task();
      await onChanged();
      setNotice(success);
      return true;
    } catch (error) {
      setFailure((error as Error).message);
      return false;
    } finally {
      setPending("");
    }
  };
  const probe = (provider: ProviderProfile) =>
    act(
      provider.id,
      () =>
        request(`/api/providers/${provider.id}/probe`, {
          method: "POST",
          body: "{}",
          signal: AbortSignal.timeout(30000),
        }),
      "Connection check finished. The status below reflects the provider response.",
    );
  if (!data)
    return (
      <section className="admin-loading">
        <Settings2 size={30} />
        <h2>
          {props.error
            ? "Administration unavailable"
            : "Opening your control room…"}
        </h2>
        <p>{props.error || "Reading encrypted local settings."}</p>
        {props.error && (
          <button className="secondary" onClick={() => void reload()}>
            <RefreshCw size={15} />
            Try again
          </button>
        )}
      </section>
    );
  const primary = data.providers.find(
    (item) => item.id === data.settings.primary_provider_id,
  );
  const checkedLocal = data.providers.filter(
    (item) =>
      item.kind === "ollama" && item.loaded_models !== null && item.checked_at,
  );
  const loaded = checkedLocal.reduce(
    (sum, item) => sum + (item.loaded_models?.length ?? 0),
    0,
  );
  return (
    <div className="admin-space">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            {view === "models"
              ? "EVERY MODEL. ONE PLACE."
              : "YOUR RULES, APPLIED LOCALLY."}
          </div>
          <h1>
            {view === "models"
              ? "Your model control room."
              : "Make OMNI work your way."}
          </h1>
          <p>
            {view === "models"
              ? "Connect providers, inspect availability, and choose where your next request goes."
              : "Manage memory extraction, activity retention and the boundaries of your installation."}
          </p>
        </div>
        <div className="admin-heading-actions">
          <button
            className="secondary"
            disabled={!!pending}
            onClick={() => void reload()}
            aria-label="Refresh administration"
          >
            <RefreshCw size={15} />
          </button>
          {view === "models" && (
            <button
              className="primary"
              onClick={() => {
                setFailure("");
                setEditing("new");
              }}
            >
              <Plus size={16} />
              Add provider
            </button>
          )}
        </div>
      </section>
      {(props.error || failure) && (
        <p className="admin-feedback error" role="alert">
          {failure || props.error}
        </p>
      )}
      {notice && (
        <p className="admin-feedback success" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      {view === "models" ? (
        <>
          <div className="admin-summary">
            <article>
              <Cpu size={19} />
              <span>Default provider</span>
              <strong>{primary?.label || "Choose a provider"}</strong>
              <small>{primary?.model || "No default model selected"}</small>
            </article>
            <article>
              <Zap size={19} />
              <span>Loaded local models</span>
              <strong>{checkedLocal.length ? loaded : "—"}</strong>
              <small>
                {checkedLocal.length
                  ? "At the last Ollama check"
                  : "Check Ollama to inspect its memory"}
              </small>
            </article>
            <article>
              <Globe2 size={19} />
              <span>Configured connections</span>
              <strong>
                {data.providers.filter((item) => item.enabled).length}
                <i> / {data.providers.length}</i>
              </strong>
              <small>
                Enabled profiles · availability is checked separately
              </small>
            </article>
          </div>
          <div className="provider-grid">
            {data.providers.map((provider) => (
              <article
                key={provider.id}
                className={`provider-card ${provider.id === primary?.id ? "is-primary" : ""}`}
                data-provider-id={provider.id}
              >
                <header>
                  <div className={`provider-monogram ${provider.kind}`}>
                    {kinds[provider.kind]?.letter ?? "↗"}
                  </div>
                  <div>
                    <h2>{provider.label}</h2>
                    <p>{kinds[provider.kind]?.description ?? provider.kind}</p>
                  </div>
                  {provider.id === primary?.id && (
                    <span className="admin-tag primary-tag">Default</span>
                  )}
                </header>
                <div className="provider-connection">
                  <span
                    className={`provider-health ${provider.enabled && provider.status === "available" && provider.policy_allowed !== false ? "available" : provider.status === "auth_error" || provider.policy_allowed === false ? "warning" : ""}`}
                  >
                    <i />
                    {statusLabel(provider)}
                  </span>
                  <span>
                    {provider.checked_at
                      ? `Checked ${dateLabel(provider.checked_at)}`
                      : "Check to verify"}
                  </span>
                </div>
                <code className="provider-address" title={provider.base_url}>
                  {provider.base_url}
                </code>
                <div className="provider-model">
                  <span>Default model</span>
                  <strong>{provider.model || "No model selected"}</strong>
                  <small>
                    {provider.has_api_key ? (
                      <>
                        <KeyRound size={12} /> Credential stored in encrypted
                        vault
                      </>
                    ) : (
                      <>
                        <LockKeyhole size={12} /> No API key stored
                      </>
                    )}
                  </small>
                </div>
                {provider.policy_allowed === false && (
                  <p className="provider-note">
                    This destination is outside the deployment allowlist. Update
                    the deployment policy before routing requests here.
                  </p>
                )}
                {provider.error && (
                  <p className="provider-note">{provider.error}</p>
                )}
                {provider.kind === "ollama" &&
                  provider.loaded_models !== null && (
                    <div className="loaded-models">
                      <span className="eyebrow">LOADED ON THIS DEVICE</span>
                      {provider.loaded_models.length ? (
                        provider.loaded_models.map((model) => (
                          <div key={model.name}>
                            <i />
                            <strong>{model.name}</strong>
                            <span>
                              {model.size_bytes
                                ? bytes(model.size_bytes)
                                : "Loaded"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p>
                          {provider.checked_at
                            ? "No models loaded at the last check."
                            : "Check this provider to inspect loaded models."}
                        </p>
                      )}
                    </div>
                  )}
                {!!provider.models?.length && (
                  <div className="provider-catalog">
                    <button
                      onClick={() =>
                        setCatalog(catalog === provider.id ? "" : provider.id)
                      }
                      aria-expanded={catalog === provider.id}
                    >
                      <span>
                        {provider.models.length} available{" "}
                        {provider.models.length === 1 ? "model" : "models"}
                      </span>
                      <ChevronDown size={15} />
                    </button>
                    {catalog === provider.id && (
                      <div className="catalog-options">
                        {provider.models.map((model) => (
                          <button
                            key={model}
                            disabled={!!pending || model === provider.model}
                            onClick={() =>
                              void act(
                                provider.id,
                                () =>
                                  request(`/api/providers/${provider.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ model }),
                                  }),
                                "Default model updated. Start a new conversation to use it.",
                              )
                            }
                          >
                            <span>{model}</span>
                            {model === provider.model ? (
                              <Check size={14} />
                            ) : (
                              <ArrowRight size={14} />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <footer>
                  <button
                    className="secondary"
                    disabled={
                      !!pending ||
                      !provider.enabled ||
                      provider.policy_allowed === false
                    }
                    onClick={() => void probe(provider)}
                  >
                    <RefreshCw
                      size={14}
                      className={pending === provider.id ? "admin-spin" : ""}
                    />
                    {pending === provider.id ? "Checking…" : "Check connection"}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setFailure("");
                      setEditing(provider);
                    }}
                    disabled={!!pending}
                  >
                    Edit
                  </button>
                  {provider.id !== primary?.id && (
                    <button
                      className="text-button"
                      disabled={
                        !!pending ||
                        !provider.enabled ||
                        provider.policy_allowed === false ||
                        !provider.model
                      }
                      onClick={() =>
                        void act(
                          provider.id,
                          () =>
                            request("/api/admin/settings", {
                              method: "PATCH",
                              body: JSON.stringify({
                                primary_provider_id: provider.id,
                              }),
                            }),
                          "Default provider changed. Future conversations will use this destination.",
                        )
                      }
                    >
                      Use by default
                    </button>
                  )}
                  <button
                    className="icon-button provider-delete"
                    aria-label={`Remove ${provider.label}`}
                    disabled={!!pending || provider.id === primary?.id}
                    title={
                      provider.id === primary?.id
                        ? "Choose another default before removing this provider"
                        : "Remove provider"
                    }
                    onClick={() => setDeleting(provider)}
                  >
                    <Trash2 size={14} />
                  </button>
                </footer>
              </article>
            ))}
          </div>
          {!data.providers.length && (
            <div className="admin-empty">
              <Cpu size={32} />
              <h2>Connect your first model.</h2>
              <p>Add a local Ollama instance or your own API provider.</p>
              <button className="primary" onClick={() => setEditing("new")}>
                <Plus size={16} />
                Add provider
              </button>
            </div>
          )}
          <aside className="admin-boundary">
            <Shield size={19} />
            <div>
              <strong>Availability is not observation.</strong>
              <p>
                OMNI records requests routed through its launcher and gateway.
                Provider catalogs show API access; only Ollama reports models
                loaded locally. ChatGPT and Claude website sessions are not
                monitored automatically.
              </p>
            </div>
          </aside>
        </>
      ) : (
        <SettingsPanel {...props} data={data} act={act} pending={pending} />
      )}
      {editing && (
        <ProviderEditor
          provider={editing === "new" ? null : editing}
          request={request}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onChanged();
            setNotice(
              "Provider saved locally. Check the connection before your first request.",
            );
          }}
        />
      )}
      {deleting && (
        <Dialog
          title="Remove this provider?"
          busy={!!pending}
          onClose={() => setDeleting(null)}
        >
          <p className="admin-dialog-copy">
            {deleting.label} and its saved credential will be removed. Existing
            activity and disclosure receipts remain. This does not delete
            anything at the provider.
          </p>
          <div className="admin-dialog-actions">
            <button
              className="secondary"
              disabled={!!pending}
              onClick={() => setDeleting(null)}
            >
              Keep provider
            </button>
            <button
              className="danger-button"
              disabled={!!pending}
              onClick={async () => {
                if (
                  await act(
                    "remove",
                    () =>
                      request(`/api/providers/${deleting.id}`, {
                        method: "DELETE",
                      }),
                    "Provider removed.",
                  )
                )
                  setDeleting(null);
              }}
            >
              Remove provider
            </button>
          </div>
          {failure && (
            <p className="error" role="alert">
              {failure}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

type Act = (
  key: string,
  task: () => Promise<unknown>,
  success: string,
) => Promise<boolean>;
function SettingsPanel({
  data,
  request,
  act,
  pending,
  analyticsEnabled,
  green,
  onGreen,
}: Props & { data: AdminState; act: Act; pending: string }) {
  const [retention, setRetention] = useState(
    String(data.settings.history_retention_days),
  );
  const [extractorBase, setExtractorBase] = useState(
    data.settings.extractor_base,
  );
  const [extractorModel, setExtractorModel] = useState(
    data.settings.extractor_model,
  );
  const [clearHistory, setClearHistory] = useState(false);
  const [clearError, setClearError] = useState("");
  const exportConfiguration = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            settings: data.settings,
            providers: data.providers.map(
              ({ id, label, kind, base_url, model, enabled, rates }) => ({
                id,
                label,
                kind,
                base_url,
                model,
                enabled,
                rates,
              }),
            ),
            runtime: data.runtime,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "omni-configuration-without-secrets.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="settings-layout">
      <section className="settings-section">
        <div className="settings-heading">
          <Activity size={21} />
          <div>
            <h2>Activity & retention</h2>
            <p>An encrypted record of what your models do through OMNI.</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Keep interaction metadata</h3>
            <p>
              Record provider, model, timing, usage and delivery status.
              Prompts, replies and API keys are excluded.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={data.settings.history_enabled}
            aria-label="Keep interaction metadata"
            className={`admin-switch ${data.settings.history_enabled ? "on" : ""}`}
            disabled={!!pending}
            onClick={() =>
              void act(
                "history",
                () =>
                  request("/api/admin/settings", {
                    method: "PATCH",
                    body: JSON.stringify({
                      history_enabled: !data.settings.history_enabled,
                    }),
                  }),
                "Activity recording preference saved.",
              )
            }
          >
            <span />
          </button>
        </div>
        <form
          className="setting-row"
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              "retention",
              () =>
                request("/api/admin/settings", {
                  method: "PATCH",
                  body: JSON.stringify({
                    history_retention_days: Number(retention),
                  }),
                }),
              "Retention policy saved.",
            );
          }}
        >
          <div>
            <h3>Retention period</h3>
            <p>
              Older activity metadata is pruned locally. Your memories and
              privacy budget are independent.
            </p>
          </div>
          <div className="setting-controls">
            <label className="sr-only" htmlFor="history-days">
              History retention in days
            </label>
            <input
              id="history-days"
              type="number"
              min={1}
              max={365}
              required
              value={retention}
              onChange={(event) => setRetention(event.target.value)}
            />
            <span>days</span>
            <button
              className="secondary"
              disabled={
                !!pending ||
                Number(retention) === data.settings.history_retention_days
              }
            >
              <Save size={14} />
              Save
            </button>
          </div>
        </form>
        <div className="setting-row">
          <div>
            <h3>Clear interaction history</h3>
            <p>
              Remove recorded interaction metadata. Your memories, permissions,
              receipts and privacy budget stay intact.
            </p>
          </div>
          <button
            className="danger-button"
            disabled={!!pending}
            onClick={() => {
              setClearError("");
              setClearHistory(true);
            }}
          >
            Clear history
          </button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-heading">
          <Cpu size={21} />
          <div>
            <h2>Memory extraction</h2>
            <p>
              Turn captured text into proposals using a model on this device.
            </p>
          </div>
          <span className="admin-tag">Local only</span>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              "extractor",
              () =>
                request("/api/admin/settings", {
                  method: "PATCH",
                  body: JSON.stringify({
                    extractor_base: extractorBase.trim(),
                    extractor_model: extractorModel.trim(),
                  }),
                }),
              "Local extraction settings saved.",
            );
          }}
        >
          <div className="admin-field">
            <label htmlFor="extractor-base">Local model API endpoint</label>
            <input
              id="extractor-base"
              type="url"
              required
              value={extractorBase}
              onChange={(event) => setExtractorBase(event.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="extractor-model">Extraction model</label>
            <input
              id="extractor-model"
              required
              value={extractorModel}
              onChange={(event) => setExtractorModel(event.target.value)}
            />
          </div>
          <p className="settings-hint">
            A loopback address is required. Extraction never falls back to a
            cloud provider, and proposed memories always need your review.
          </p>
          <button
            className="secondary"
            disabled={
              !!pending ||
              (extractorBase === data.settings.extractor_base &&
                extractorModel === data.settings.extractor_model)
            }
          >
            <Save size={14} />
            Save extraction settings
          </button>
        </form>
      </section>
      <section className="settings-section">
        <div className="settings-heading">
          <Shield size={21} />
          <div>
            <h2>Privacy & appearance</h2>
            <p>Local controls with visible consequences.</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Allow private analytics reports</h3>
            <p>
              Enable preparation of noised, numeric reports. Each export still
              requires review in Collective.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={analyticsEnabled}
            aria-label="Allow private analytics reports"
            className={`admin-switch ${analyticsEnabled ? "on" : ""}`}
            disabled={!!pending}
            onClick={() =>
              void act(
                "consent",
                () =>
                  request("/api/analytics/consent", {
                    method: "POST",
                    body: JSON.stringify({ enabled: !analyticsEnabled }),
                  }),
                "Analytics consent updated.",
              )
            }
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <div>
            <h3>Low energy mode</h3>
            <p>
              Render Nebula on demand. Reduced-motion preferences are also
              respected.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={green}
            aria-label="Low energy rendering"
            className={`admin-switch ${green ? "on" : ""}`}
            onClick={() => onGreen(!green)}
          >
            <span />
          </button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-heading">
          <LockKeyhole size={21} />
          <div>
            <h2>Installation & network policy</h2>
            <p>
              These deployment boundaries are read from the running service.
            </p>
          </div>
          <span className="admin-tag">Read-only</span>
        </div>
        <dl className="runtime-grid">
          <div>
            <dt>Core service</dt>
            <dd>
              {data.runtime.core_address ||
                data.runtime.listen_address ||
                "http://127.0.0.1:3007"}
            </dd>
          </div>
          <div>
            <dt>Vault protection</dt>
            <dd>
              SQLCipher ·{" "}
              {data.runtime.key_storage === "keychain"
                ? "macOS Keychain"
                : "development key file"}
            </dd>
          </div>
          <div>
            <dt>Remote transport</dt>
            <dd>
              {data.runtime.socks_proxy_configured
                ? "SOCKS proxy configured"
                : "Direct HTTPS"}
            </dd>
          </div>
          <div>
            <dt>Tunnel policy</dt>
            <dd>
              {data.runtime.vpn_required
                ? "Required · no direct fallback"
                : "Optional"}
            </dd>
          </div>
          <div>
            <dt>Analytics destination</dt>
            <dd>{data.runtime.analytics_url || "Local collector"}</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>
              {data.runtime.simulation
                ? "Isolated synthetic demonstration"
                : "Personal installation"}
            </dd>
          </div>
        </dl>
        {data.runtime.upstream_allowlist_enforced && (
          <div className="policy-list">
            <strong>Deployment allowlist</strong>
            {data.runtime.upstream_allowlist?.map((url) => (
              <code key={url}>{url}</code>
            ))}
          </div>
        )}
        <p className="settings-hint">
          Transport settings are not a tunnel health check. Listening addresses,
          key custody and enforced network policy require a service restart;
          they cannot be changed by an agent or provider.
        </p>
        <button className="secondary" onClick={exportConfiguration}>
          <Download size={14} />
          Export configuration without secrets
        </button>
      </section>
      {clearHistory && (
        <Dialog
          title="Clear interaction history?"
          busy={!!pending}
          onClose={() => setClearHistory(false)}
        >
          <p className="admin-dialog-copy">
            This permanently removes the local activity ledger. It does not
            clear memories, disclosure receipts, audit records or the
            differential privacy budget.
          </p>
          <div className="admin-dialog-actions">
            <button
              className="secondary"
              disabled={!!pending}
              onClick={() => setClearHistory(false)}
            >
              Keep history
            </button>
            <button
              className="danger-button"
              disabled={!!pending}
              onClick={async () => {
                if (
                  await act(
                    "clear",
                    () => request("/api/interactions", { method: "DELETE" }),
                    "Interaction history cleared.",
                  )
                )
                  setClearHistory(false);
                else
                  setClearError(
                    "History could not be cleared. Review the service error after closing this dialog.",
                  );
              }}
            >
              Permanently clear history
            </button>
          </div>
          {clearError && (
            <p className="error" role="alert">
              {clearError}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

function ProviderEditor({
  provider,
  request,
  onClose,
  onSaved,
}: {
  provider: ProviderProfile | null;
  request: LocalRequest;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<ProviderKind>(provider?.kind || "ollama");
  const [label, setLabel] = useState(provider?.label || presets.ollama.label);
  const [base, setBase] = useState(
    provider?.base_url || presets.ollama.base_url,
  );
  const [model, setModel] = useState(provider?.model || "");
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [pricing, setPricing] = useState(!!provider?.rates);
  const [inputRate, setInputRate] = useState(
    String(provider?.rates?.input_per_million ?? ""),
  );
  const [outputRate, setOutputRate] = useState(
    String(provider?.rates?.output_per_million ?? ""),
  );
  const [cachedRate, setCachedRate] = useState(
    String(provider?.rates?.cached_input_per_million ?? ""),
  );
  const [writeRate, setWriteRate] = useState(
    String(provider?.rates?.cache_write_input_per_million ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateKind = (next: ProviderKind) => {
    setKind(next);
    if (!provider) {
      setLabel(presets[next].label);
      setBase(presets[next].base_url);
      setModel("");
    }
    setApiKey("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request(
        provider ? `/api/providers/${provider.id}` : "/api/providers",
        {
          method: provider ? "PATCH" : "POST",
          body: JSON.stringify({
            label: label.trim(),
            kind,
            base_url: base.trim(),
            model: model.trim(),
            enabled,
            ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
            ...(clearKey ? { clear_api_key: true } : {}),
            rates: pricing
              ? {
                  currency: "USD",
                  input_per_million: Number(inputRate),
                  output_per_million: Number(outputRate),
                  ...(cachedRate !== ""
                    ? { cached_input_per_million: Number(cachedRate) }
                    : {}),
                  ...(writeRate !== ""
                    ? { cache_write_input_per_million: Number(writeRate) }
                    : {}),
                }
              : null,
          }),
        },
      );
      setApiKey("");
      await onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={provider ? "Edit provider" : "Connect a provider"}
      busy={busy}
      onClose={onClose}
    >
      <form className="provider-form" onSubmit={save}>
        <div
          className="provider-kind-options"
          role="group"
          aria-label="Provider type"
        >
          {(Object.keys(kinds) as ProviderKind[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={kind === key}
              onClick={() => updateKind(key)}
              disabled={busy}
            >
              <span>{kinds[key].letter}</span>
              {kinds[key].name}
            </button>
          ))}
        </div>
        <div className="admin-field">
          <label htmlFor="provider-label">Connection name</label>
          <input
            id="provider-label"
            required
            maxLength={80}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={busy}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="provider-base">API base URL</label>
          <input
            id="provider-base"
            type="url"
            required
            value={base}
            onChange={(event) => setBase(event.target.value)}
            placeholder="https://provider.example/v1"
            disabled={busy}
          />
          <small>
            Use HTTPS for remote providers. HTTP is allowed only on this device.
          </small>
        </div>
        <div className="admin-field">
          <label htmlFor="provider-model">Default model ID</label>
          <input
            id="provider-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Save, check the connection, then choose an available model"
            disabled={busy}
          />
          <small>
            You can discover available models after saving the connection.
          </small>
        </div>
        <div className="admin-field">
          <label htmlFor="provider-key">
            API key{" "}
            {provider?.has_api_key && <span className="admin-tag">Stored</span>}
          </label>
          <input
            id="provider-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setClearKey(false);
            }}
            placeholder={
              provider?.has_api_key
                ? "Leave empty to keep the stored key"
                : "Optional for a local provider"
            }
            disabled={busy || clearKey}
          />
          <small>
            Encrypted in your local vault. The saved key is never returned to
            the interface.
          </small>
        </div>
        {provider?.has_api_key && (
          <label className="admin-check">
            <input
              type="checkbox"
              checked={clearKey}
              disabled={busy}
              onChange={(event) => {
                setClearKey(event.target.checked);
                if (event.target.checked) setApiKey("");
              }}
            />
            Remove the saved API key
          </label>
        )}
        {provider &&
          base.trim().replace(/\/$/, "") !==
            provider.base_url.replace(/\/$/, "") && (
            <p className="provider-note">
              Changing the destination removes the old credential. Enter a key
              explicitly if the new endpoint needs one. Existing permissions
              remain tied to their original destination.
            </p>
          )}
        <label className="admin-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={busy}
          />
          Enable this connection
        </label>
        <details className="provider-pricing" open={pricing}>
          <summary>
            Cost estimation <span>Optional · your rates</span>
          </summary>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={pricing}
              onChange={(event) => setPricing(event.target.checked)}
              disabled={busy}
            />
            Use manually configured USD rates
          </label>
          <p>
            Rates are per million tokens for this profile's model. Estimates
            exclude taxes, tools and provider-specific charges. Update rates
            when changing models. Conversation overrides use no price estimate
            for a different model.
          </p>
          {pricing && (
            <div className="rate-fields">
              {[
                ["Input", inputRate, setInputRate, true],
                ["Output", outputRate, setOutputRate, true],
                ["Cached input", cachedRate, setCachedRate, false],
                ["Cache writes", writeRate, setWriteRate, false],
              ].map(([name, value, setter, required]) => (
                <div className="admin-field" key={name as string}>
                  <label
                    htmlFor={`rate-${(name as string).replaceAll(" ", "-")}`}
                  >
                    {name as string} / 1M
                  </label>
                  <input
                    id={`rate-${(name as string).replaceAll(" ", "-")}`}
                    type="number"
                    min={0}
                    max={1000000}
                    step="any"
                    required={required as boolean}
                    value={value as string}
                    onChange={(event) =>
                      (setter as (value: string) => void)(event.target.value)
                    }
                    placeholder={required ? "0.00" : "Unknown"}
                    disabled={busy}
                  />
                </div>
              ))}
            </div>
          )}
        </details>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            <Save size={15} />
            {busy ? "Saving…" : "Save provider"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
