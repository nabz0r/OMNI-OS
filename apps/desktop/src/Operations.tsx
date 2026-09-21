import { saveMetadata } from "./native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  FileJson,
  Filter,
  Info,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import "./operations.css";

export type OperationsView = "history" | "usage" | "logs";
type Period = "24h" | "7d" | "30d" | "all";
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type Status = "pending" | "streaming" | "succeeded" | "failed" | "aborted";
type NullableNumber = number | null;
interface RateSnapshot {
  input_per_million: number;
  output_per_million: number;
  cached_input_per_million: NullableNumber;
  cache_write_input_per_million: NullableNumber;
  currency: string;
}
interface Interaction {
  id: string;
  provider_id: string;
  provider_name: string;
  model: string;
  destination: string;
  operation: string;
  protocol: string;
  streaming: boolean;
  grant_id: string | null;
  receipt_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: Status;
  http_status: NullableNumber;
  header_latency_ms: NullableNumber;
  total_latency_ms: NullableNumber;
  request_bytes: NullableNumber;
  response_bytes: NullableNumber;
  context_bytes: NullableNumber;
  source_bytes_baseline: NullableNumber;
  estimated_context_tokens: NullableNumber;
  estimated_source_tokens: NullableNumber;
  input_tokens: NullableNumber;
  output_tokens: NullableNumber;
  cached_tokens: NullableNumber;
  cache_write_tokens: NullableNumber;
  total_tokens: NullableNumber;
  error_code: string | null;
  estimated_cost: NullableNumber;
  cost_currency: string | null;
  rate_snapshot?: RateSnapshot | null;
}
interface Totals {
  interactions: number;
  succeeded: number;
  failed: number;
  aborted: number;
  pending: number;
  streaming: number;
  request_bytes: NullableNumber;
  response_bytes: NullableNumber;
  input_tokens: NullableNumber;
  output_tokens: NullableNumber;
  cached_tokens: NullableNumber;
  cache_write_tokens: NullableNumber;
  total_tokens: NullableNumber;
  token_observations: {
    input: number;
    output: number;
    cached: number;
    cache_write: number;
    total: number;
  };
  estimated_cost: NullableNumber;
  cost_currency: string | null;
  priced_interactions: number;
}
interface Usage {
  period: Period;
  from: string | null;
  until: string;
  totals: Totals;
  models: {
    provider_id: string;
    provider_name: string;
    model: string;
    totals: Totals;
  }[];
  context_comparison: {
    interactions: number;
    context_bytes: number;
    source_bytes_baseline: number;
    byte_reduction: number;
    reduction_percent: NullableNumber;
    measurement: string;
  };
  token_estimation: string;
  cost_basis: string;
}
interface AuditEvent {
  id: string;
  created_at: string;
  action: string;
  level: "info" | "warning" | "error";
  details: {
    provider_id?: string;
    model?: string;
    entity_id?: string;
    count?: number;
    enabled?: boolean;
    retention_days?: number;
    http_status?: number;
    error_code?: string;
  };
}
interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
interface ProviderOption {
  id: string;
  label: string;
}
const PERIODS: { value: Period; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];
const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const known = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) => (known(value) ? integer.format(value) : "—");
const humanize = (value: string) =>
  value.replace(/[_\.]/g, " ").replace(/^./, (letter) => letter.toUpperCase());
function bytes(value: unknown) {
  if (!known(value)) return "—";
  if (Math.abs(value) < 1024) return `${count(value)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(4, Math.floor(Math.log2(Math.abs(value)) / 10));
  return `${(value / 1024 ** exponent).toLocaleString("en", { maximumFractionDigits: 1 })} ${units[exponent - 1]}`;
}
function duration(value: unknown) {
  if (!known(value)) return "—";
  if (value < 1000) return `${count(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
}
function cost(value: unknown, currency: string | null) {
  if (!known(value) || !currency) return "—";
  const formatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return value > 0 && value < 0.0001
    ? `<${formatter.format(0.0001)}`
    : formatter.format(value);
}
function time(value: string | null, full = false) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(full ? { second: "2-digit", year: "numeric" } : {}),
  }).format(new Date(value));
}
const coverage = (observed: number, total: number) =>
  `${count(observed)} of ${count(total)} requests`;

function useResource<T>(
  request: Request,
  path: string | null,
  revision: number,
) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
  }>({ data: null, loading: false, error: "" });
  const requester = useRef(request);
  requester.current = request;
  useEffect(() => {
    const controller = new AbortController();
    if (!path) {
      setState({ data: null, loading: false, error: "" });
      return () => controller.abort();
    }
    setState({ data: null, loading: true, error: "" });
    void requester
      .current<T>(path, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            data: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "The local service could not complete this request.",
          });
      });
    return () => controller.abort();
  }, [path, revision]);
  return state;
}
function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "failed" || status === "error"
      ? "error"
      : status === "aborted" || status === "warning"
        ? "warning"
        : ["pending", "streaming"].includes(status)
          ? "muted"
          : "success";
  return (
    <span className="ops-status" data-tone={tone}>
      <i className="ops-status-dot" />
      {humanize(status)}
    </span>
  );
}
function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ops-empty">
      <div className="ops-empty-icon">
        <Layers3 size={23} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Loading() {
  return (
    <div
      className="ops-skeleton"
      role="status"
      aria-label="Loading operational data"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div className="ops-skeleton-row" key={index}>
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
  amber,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  amber?: boolean;
}) {
  return (
    <article className={`ops-metric${amber ? " ops-amber" : ""}`}>
      <div className="ops-metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <div className="ops-metric-value">{value}</div>
      <p>{note}</p>
    </article>
  );
}
function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (value: Period) => void;
}) {
  return (
    <div className="ops-period" aria-label="Reporting period">
      {PERIODS.map((period) => (
        <button
          type="button"
          key={period.value}
          aria-pressed={value === period.value}
          onClick={() => onChange(period.value)}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
function Pagination({
  total,
  offset,
  limit,
  onPage,
  onLimit,
}: {
  total: number;
  offset: number;
  limit: number;
  onPage: (offset: number) => void;
  onLimit: (limit: number) => void;
}) {
  return (
    <footer className="ops-pagination">
      <span>
        {total
          ? `${count(offset + 1)}–${count(Math.min(offset + limit, total))} of ${count(total)} records`
          : "No matching records"}
      </span>
      <div>
        <label className="ops-filter-label">
          Rows{" "}
          <select
            aria-label="Rows per page"
            value={limit}
            onChange={(event) => onLimit(Number(event.target.value))}
          >
            {[25, 50, 100].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <button
          className="ops-button"
          aria-label="Previous page"
          disabled={offset === 0}
          onClick={() => onPage(Math.max(0, offset - limit))}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          className="ops-button"
          aria-label="Next page"
          disabled={offset + limit >= total}
          onClick={() => onPage(offset + limit)}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </footer>
  );
}
function interactionMetadata(item: Interaction): Record<string, unknown> {
  return {
    id: item.id,
    started_at: item.started_at,
    finished_at: item.finished_at,
    provider_id: item.provider_id,
    provider_name: item.provider_name,
    model: item.model,
    destination: item.destination,
    operation: item.operation,
    protocol: item.protocol,
    streaming: item.streaming,
    status: item.status,
    http_status: item.http_status,
    header_latency_ms: item.header_latency_ms,
    total_latency_ms: item.total_latency_ms,
    request_bytes: item.request_bytes,
    response_bytes: item.response_bytes,
    context_bytes: item.context_bytes,
    source_bytes_baseline: item.source_bytes_baseline,
    estimated_context_tokens: item.estimated_context_tokens,
    estimated_source_tokens: item.estimated_source_tokens,
    input_tokens: item.input_tokens,
    output_tokens: item.output_tokens,
    cached_tokens: item.cached_tokens,
    cache_write_tokens: item.cache_write_tokens,
    total_tokens: item.total_tokens,
    estimated_cost: item.estimated_cost,
    cost_currency: item.cost_currency,
    grant_id: item.grant_id,
    receipt_id: item.receipt_id,
    error_code: item.error_code,
  };
}
function totalsMetadata(value: Totals): Record<string, unknown> {
  return {
    interactions: value.interactions,
    succeeded: value.succeeded,
    failed: value.failed,
    aborted: value.aborted,
    pending: value.pending,
    streaming: value.streaming,
    request_bytes: value.request_bytes,
    response_bytes: value.response_bytes,
    input_tokens: value.input_tokens,
    output_tokens: value.output_tokens,
    cached_tokens: value.cached_tokens,
    cache_write_tokens: value.cache_write_tokens,
    total_tokens: value.total_tokens,
    input_token_observations: value.token_observations.input,
    output_token_observations: value.token_observations.output,
    cache_read_observations: value.token_observations.cached,
    cache_write_observations: value.token_observations.cache_write,
    total_token_observations: value.token_observations.total,
    estimated_cost: value.estimated_cost,
    cost_currency: value.cost_currency,
    priced_interactions: value.priced_interactions,
  };
}
function logMetadata(item: AuditEvent): Record<string, unknown> {
  const details = item.details;
  return {
    id: item.id,
    created_at: item.created_at,
    level: item.level,
    action: item.action,
    provider_id: details.provider_id ?? null,
    model: details.model ?? null,
    entity_id: details.entity_id ?? null,
    count: details.count ?? null,
    enabled: details.enabled ?? null,
    retention_days: details.retention_days ?? null,
    http_status: details.http_status ?? null,
    error_code: details.error_code ?? null,
  };
}
async function download(
  rows: Record<string, unknown>[],
  format: "csv" | "json",
  view: OperationsView,
  filters: Record<string, unknown>,
) {
  const csvCell = (value: unknown) => {
    let text =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r\n]/.test(text.trimStart()))
      text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const content =
    format === "json"
      ? JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            scope:
              view === "usage"
                ? "selected_period_model_metadata"
                : "current_page_metadata",
            filters,
            items: rows,
          },
          null,
          2,
        )
      : [
          columns.map(csvCell).join(","),
          ...rows.map((row) =>
            columns.map((column) => csvCell(row[column])).join(","),
          ),
        ].join("\r\n");
  return saveMetadata(
    `omni-${view}-${new Date().toISOString().slice(0, 10)}.${format}`,
    content,
    format === "json" ? "application/json" : "text/csv",
  );
}
function DetailDialog({
  item,
  onClose,
}: {
  item: Interaction;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const pair = (label: string, value: ReactNode) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <dialog
      ref={dialog}
      className="ops-dialog"
      aria-labelledby="ops-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <header className="ops-dialog-head">
        <div className="ops-eyebrow">REQUEST METADATA</div>
        <h2 id="ops-detail-title">{item.model || "Unspecified model"}</h2>
        <p>
          {item.provider_name || item.provider_id} ·{" "}
          {time(item.started_at, true)}
        </p>
        <button
          className="ops-dialog-close"
          aria-label="Close request details"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="ops-dialog-body">
        <StatusBadge status={item.status} />
        <dl className="ops-detail-grid">
          {pair("Request ID", <code>{item.id}</code>)}
          {pair("Destination", <code>{item.destination}</code>)}
          {pair(
            "Operation / protocol",
            `${humanize(item.operation)} · ${item.protocol}`,
          )}
          {pair(
            "Transport mode",
            item.streaming ? "Streaming response" : "Complete response",
          )}
          {pair("HTTP status", count(item.http_status))}
          {pair("Finished", time(item.finished_at, true))}
          {pair("Time to headers", duration(item.header_latency_ms))}
          {pair("Total duration", duration(item.total_latency_ms))}
          {pair("Request body", bytes(item.request_bytes))}
          {pair("Response body", bytes(item.response_bytes))}
          {pair("Input tokens", count(item.input_tokens))}
          {pair("Output tokens", count(item.output_tokens))}
          {pair("Cache read tokens", count(item.cached_tokens))}
          {pair("Cache write tokens", count(item.cache_write_tokens))}
          {pair("Total reported tokens", count(item.total_tokens))}
          {pair(
            "Estimated cost",
            cost(item.estimated_cost, item.cost_currency),
          )}
        </dl>
        <div className="ops-note">
          <ShieldCheck size={15} />
          <span>
            This record contains operational metadata. Prompt and response
            bodies are not available in this view. A missing measurement is
            shown as —.
          </span>
        </div>
        {item.error_code && (
          <div className="ops-note ops-warning">
            <TriangleAlert size={15} />
            <span>
              Error code: <code>{item.error_code}</code>. A failed or aborted
              request may already have reached its provider.
            </span>
          </div>
        )}
        <section className="ops-dialog-section">
          <h3>Context and authority</h3>
          <dl className="ops-detail-grid">
            {pair(
              "Permission",
              item.grant_id ? (
                <code>{item.grant_id}</code>
              ) : (
                "No memory permission"
              ),
            )}
            {pair(
              "Disclosure receipt",
              item.receipt_id ? (
                <code>{item.receipt_id}</code>
              ) : (
                "No receipt recorded"
              ),
            )}
            {pair("Inserted context", bytes(item.context_bytes))}
            {pair(
              "Source comparison baseline",
              bytes(item.source_bytes_baseline),
            )}
            {pair(
              "Estimated context tokens",
              count(item.estimated_context_tokens),
            )}
            {pair(
              "Estimated source tokens",
              count(item.estimated_source_tokens),
            )}
          </dl>
          <p>
            The context comparison is a benchmark against source material, not
            measured network savings. Context token estimates use UTF-8 bytes ÷
            4, rounded up; provider usage above is separate.
          </p>
        </section>
        {item.rate_snapshot && (
          <section className="ops-dialog-section">
            <h3>Recorded rate snapshot</h3>
            <dl className="ops-detail-grid">
              {pair(
                "Input / million tokens",
                cost(
                  item.rate_snapshot.input_per_million,
                  item.rate_snapshot.currency,
                ),
              )}
              {pair(
                "Output / million tokens",
                cost(
                  item.rate_snapshot.output_per_million,
                  item.rate_snapshot.currency,
                ),
              )}
              {pair(
                "Cache read / million tokens",
                cost(
                  item.rate_snapshot.cached_input_per_million,
                  item.rate_snapshot.currency,
                ),
              )}
              {pair(
                "Cache write / million tokens",
                cost(
                  item.rate_snapshot.cache_write_input_per_million,
                  item.rate_snapshot.currency,
                ),
              )}
            </dl>
            <p>
              These manual rates were attached to this request. Editing current
              provider rates does not change this snapshot.
            </p>
          </section>
        )}
        <section className="ops-dialog-section">
          <h3>How to read this record</h3>
          <p>
            Byte counts describe application bodies, excluding transport
            overhead. In-progress or interrupted streams may have partial
            response counts. Costs use configured rate snapshots, not an
            invoice. An unknown cost can mean missing rates or incomplete usage.
          </p>
        </section>
      </div>
    </dialog>
  );
}

export default function Operations({
  view,
  request,
  onOpenProviders,
  onChanged,
}: {
  view: OperationsView;
  request: Request;
  onOpenProviders?: () => void;
  onChanged?: () => void;
}) {
  const [period, setPeriod] = useState<Period>("7d");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [level, setLevel] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Interaction | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setOffset(0);
    setQuery("");
    setSearch("");
    setStatus("");
    setLevel("");
    setSelected(null);
    setExportError("");
  }, [view]);
  const params = new URLSearchParams({
    period,
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set("search", search);
  if (provider) params.set("provider_id", provider);
  if (view === "history" && status) params.set("status", status);
  if (view === "logs" && level) params.set("level", level);
  const history = useResource<Page<Interaction>>(
    request,
    view === "history" ? `/api/interactions?${params}` : null,
    revision,
  );
  const logs = useResource<Page<AuditEvent>>(
    request,
    view === "logs" ? `/api/logs?${params}` : null,
    revision,
  );
  const usage = useResource<Usage>(
    request,
    view === "usage" ? `/api/usage?period=${period}` : null,
    revision,
  );
  const providers = useResource<{
    providers: ProviderOption[];
    settings: { history_enabled: boolean; history_retention_days: number };
  }>(request, "/api/admin", revision);
  const active = view === "history" ? history : view === "logs" ? logs : usage;
  const options = providers.data?.providers ?? [];
  const refresh = () => {
    setRevision((value) => value + 1);
    onChanged?.();
  };
  const updatePeriod = (value: Period) => {
    setPeriod(value);
    setOffset(0);
  };
  const exportRows =
    view === "history"
      ? (history.data?.items ?? []).map(interactionMetadata)
      : view === "logs"
        ? (logs.data?.items ?? []).map(logMetadata)
        : (usage.data?.models ?? []).map((model) => ({
            provider_id: model.provider_id,
            provider_name: model.provider_name,
            model: model.model,
            period: usage.data?.period,
            from: usage.data?.from,
            until: usage.data?.until,
            ...totalsMetadata(model.totals),
            cost_basis: usage.data?.cost_basis,
          }));
  const exportFile = async (format: "csv" | "json") => {
    setExportStatus("");
    try {
      const result = await download(exportRows, format, view, {
        period,
        ...(view === "usage"
          ? {}
          : {
              search,
              provider_id: provider || null,
              status: status || null,
              level: level || null,
              offset,
              limit,
            }),
      });
      setExportError("");
      setExportStatus(result);
    } catch {
      setExportError(
        "The export could not be prepared. Refresh the view and try again.",
      );
    }
  };
  const title =
    view === "history"
      ? "Every request, accounted for."
      : view === "usage"
        ? "Understand what you use."
        : "A record of your controls.";
  const description =
    view === "history"
      ? "Follow model requests through your local core. Inspect timing, usage and the context shared, without opening conversation bodies."
      : view === "usage"
        ? "Compare model activity, observed tokens and application payloads. Estimates remain distinct from measurements."
        : "Inspect OMNI’s local audit events. These are application records, not your device’s operating-system logs.";
  return (
    <section className="ops" aria-label={`${humanize(view)} operations`}>
      <header className="ops-heading">
        <div>
          <div className="ops-eyebrow">
            {view === "logs" ? (
              <ShieldCheck size={12} />
            ) : (
              <Activity size={12} />
            )}{" "}
            LOCAL OPERATIONS / {view.toUpperCase()}
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="ops-actions">
          <button
            className="ops-button ops-subtle"
            onClick={refresh}
            disabled={active.loading}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {onOpenProviders && view === "usage" && (
            <button className="ops-button" onClick={onOpenProviders}>
              <SlidersHorizontal size={14} />
              Provider settings
            </button>
          )}
        </div>
      </header>
      <div className="ops-toolbar">
        <PeriodPicker value={period} onChange={updatePeriod} />
        <div className="ops-actions" style={{ marginLeft: "auto" }}>
          <button
            className="ops-button ops-subtle"
            disabled={!exportRows.length || active.loading}
            onClick={() => exportFile("csv")}
            title={
              view === "usage"
                ? "Export model totals for this period"
                : "Export metadata from this page"
            }
          >
            <Download size={13} />
            CSV
          </button>
          <button
            className="ops-button ops-subtle"
            disabled={!exportRows.length || active.loading}
            onClick={() => exportFile("json")}
            title={
              view === "usage"
                ? "Export model totals for this period"
                : "Export metadata from this page"
            }
          >
            <FileJson size={13} />
            JSON
          </button>
        </div>
      </div>
      {view !== "usage" && (
        <div className="ops-toolbar">
          <label className="ops-search">
            <Search size={15} />
            <input
              aria-label={
                view === "history"
                  ? "Search request metadata"
                  : "Search audit events"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                view === "history"
                  ? "Search model, provider or request metadata…"
                  : "Search actions or event metadata…"
              }
            />
          </label>
          <label className="ops-filter-label">
            <Filter size={13} />
            <select
              aria-label="Filter by provider"
              value={provider}
              disabled={!options.length && !provider}
              onChange={(event) => {
                setProvider(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All providers</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              {provider &&
                !options.some((option) => option.id === provider) && (
                  <option value={provider}>{provider}</option>
                )}
            </select>
          </label>
          {view === "history" ? (
            <select
              aria-label="Filter request status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All statuses</option>
              {["succeeded", "failed", "aborted", "pending", "streaming"].map(
                (value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ),
              )}
            </select>
          ) : (
            <select
              aria-label="Filter audit level"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All levels</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          )}
        </div>
      )}
      {providers.data?.settings.history_enabled === false &&
        view !== "logs" && (
          <div className="ops-note ops-warning">
            <Info size={15} />
            <span>
              Local request history is paused. Existing records remain visible;
              new requests are not added. Audit events are recorded separately.
            </span>
          </div>
        )}
      {providers.error && view !== "usage" && (
        <div className="ops-note ops-warning">
          <Info size={14} />
          <span>
            Provider filters are unavailable. You can still search the loaded
            journal or retry with Refresh.
          </span>
        </div>
      )}
      {exportStatus && (
        <div className="ops-note" role="status">
          {exportStatus}
        </div>
      )}
      {(active.error || exportError) && (
        <div className="ops-note ops-error" role="alert">
          <TriangleAlert size={16} />
          <span>{active.error || exportError}</span>
          <button className="ops-button" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      {active.loading && (
        <div className="ops-panel">
          <Loading />
        </div>
      )}
      {!active.loading &&
        !active.error &&
        view === "history" &&
        history.data && (
          <div className="ops-panel">
            <div className="ops-panel-header">
              <div>
                <h2>Request history</h2>
                <p>Open any model request to inspect its complete metadata.</p>
              </div>
              <span>{count(history.data.total)} matching records</span>
            </div>
            {history.data.items.length ? (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Model / provider</th>
                      <th>Started</th>
                      <th>Status</th>
                      <th className="ops-number">Duration</th>
                      <th className="ops-number">Tokens</th>
                      <th className="ops-number">Payload out / in</th>
                      <th className="ops-number">Est. cost</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <button
                            className="ops-request-link"
                            onClick={() => setSelected(item)}
                            aria-label={`Open request ${item.id}`}
                          >
                            <span className="ops-request-icon">
                              <Activity size={15} />
                            </span>
                            <span>
                              <strong className="ops-cell-main">
                                {item.model || "Unspecified model"}
                              </strong>
                              <span className="ops-cell-sub">
                                {item.provider_name || item.provider_id} ·{" "}
                                {humanize(item.operation)}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td>
                          <time
                            className="ops-cell-main"
                            dateTime={item.started_at}
                          >
                            {time(item.started_at)}
                          </time>
                          <span className="ops-cell-sub">
                            {item.protocol}
                            {item.streaming ? " · stream" : ""}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={item.status} />
                          {item.http_status != null && (
                            <span className="ops-cell-sub">
                              HTTP {item.http_status}
                            </span>
                          )}
                        </td>
                        <td className="ops-number">
                          {duration(item.total_latency_ms)}
                          <span className="ops-cell-sub">
                            {duration(item.header_latency_ms)} to headers
                          </span>
                        </td>
                        <td className="ops-number">
                          {count(item.total_tokens)}
                          <span className="ops-cell-sub">
                            {count(item.input_tokens)} in ·{" "}
                            {count(item.output_tokens)} out
                          </span>
                        </td>
                        <td className="ops-number">
                          {bytes(item.request_bytes)}
                          <span className="ops-cell-sub">
                            {bytes(item.response_bytes)} received
                          </span>
                        </td>
                        <td className="ops-number">
                          {cost(item.estimated_cost, item.cost_currency)}
                          <span className="ops-cell-sub">
                            {known(item.estimated_cost)
                              ? "Configured rates"
                              : "Not estimated"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="ops-button ops-subtle"
                            aria-label={`View details for request ${item.id}`}
                            onClick={() => setSelected(item)}
                          >
                            <ArrowUpRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={
                  query || provider || status
                    ? "No matching requests"
                    : "Your request history starts here"
                }
                action={
                  onOpenProviders && !query && !provider && !status ? (
                    <button className="ops-button" onClick={onOpenProviders}>
                      Review provider connections
                      <ArrowRight size={14} />
                    </button>
                  ) : undefined
                }
              >
                {query || provider || status
                  ? "Try a broader period or remove a filter. Search covers metadata, not conversation text."
                  : "Requests routed through OMNI will appear here when local history is enabled. Applications that bypass the core are not observed."}
              </EmptyState>
            )}
            <Pagination
              total={history.data.total}
              offset={history.data.offset}
              limit={history.data.limit}
              onPage={setOffset}
              onLimit={(value) => {
                setLimit(value);
                setOffset(0);
              }}
            />
          </div>
        )}
      {!active.loading && !active.error && view === "usage" && usage.data && (
        <UsageView data={usage.data} onOpenProviders={onOpenProviders} />
      )}
      {!active.loading && !active.error && view === "logs" && logs.data && (
        <div className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Local audit journal</h2>
              <p>
                Recorded changes to memory, permissions, providers and local
                controls.
              </p>
            </div>
            <span>{count(logs.data.total)} matching events</span>
          </div>
          {logs.data.items.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Level</th>
                    <th>Event</th>
                    <th>Related metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <time
                          className="ops-cell-main"
                          dateTime={item.created_at}
                        >
                          {time(item.created_at)}
                        </time>
                        <span className="ops-cell-sub" title={item.id}>
                          #{item.id.slice(0, 8)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={item.level} />
                      </td>
                      <td>
                        <p className="ops-log-message">
                          {humanize(item.action)}
                        </p>
                        <span className="ops-log-event">{item.action}</span>
                      </td>
                      <td>
                        <AuditDetails item={item} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={
                query || level || provider
                  ? "No events match these filters"
                  : "No audit events in this period"
              }
            >
              The journal records supported OMNI actions. It does not collect
              operating-system logs, browsing history or prompt bodies.
            </EmptyState>
          )}
          <Pagination
            total={logs.data.total}
            offset={logs.data.offset}
            limit={logs.data.limit}
            onPage={setOffset}
            onLimit={(value) => {
              setLimit(value);
              setOffset(0);
            }}
          />
        </div>
      )}
      <p className="ops-footnote">
        <ShieldCheck
          size={11}
          style={{ verticalAlign: "-2px", marginRight: 5 }}
        />
        {view === "usage"
          ? "Exports contain per-model metadata totals for the selected period. Unknown usage stays unknown; totals may cover only observed requests."
          : "CSV and JSON export only the metadata on this page. No prompt or response bodies are included."}{" "}
        {providers.data
          ? ` Local retention: ${providers.data.settings.history_retention_days} days.`
          : ""}{" "}
        Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.
      </p>
      {selected && (
        <DetailDialog item={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
function AuditDetails({ item }: { item: AuditEvent }) {
  const details = item.details;
  const values = [
    details.provider_id && `Provider: ${details.provider_id}`,
    details.model && `Model: ${details.model}`,
    details.entity_id && `Record: ${details.entity_id}`,
    details.count !== undefined && `Count: ${count(details.count)}`,
    details.enabled !== undefined &&
      `Enabled: ${details.enabled ? "yes" : "no"}`,
    details.retention_days !== undefined &&
      `Retention: ${count(details.retention_days)} days`,
    details.http_status !== undefined && `HTTP ${details.http_status}`,
    details.error_code && `Error: ${details.error_code}`,
  ].filter((value): value is string => typeof value === "string");
  return values.length ? (
    <div className="ops-log-message">
      {values.map((value) => (
        <span className="ops-cell-sub" key={value} title={value}>
          {value}
        </span>
      ))}
    </div>
  ) : (
    <span className="ops-cell-sub">No additional metadata</span>
  );
}
function UsageView({
  data,
  onOpenProviders,
}: {
  data: Usage;
  onOpenProviders?: () => void;
}) {
  const totals = data.totals;
  const comparison = data.context_comparison;
  const hasRequests = totals.interactions > 0;
  const combinedBytes =
    known(totals.request_bytes) && known(totals.response_bytes)
      ? totals.request_bytes + totals.response_bytes
      : null;

  const models = [...data.models].sort(
    (a, b) => b.totals.interactions - a.totals.interactions,
  );
  return (
    <>
      <div className="ops-metrics">
        <Metric
          label="Requests"
          value={count(totals.interactions)}
          note={`${count(totals.succeeded)} succeeded · ${count(totals.failed)} failed`}
          icon={<Activity size={16} />}
        />
        <Metric
          label="Reported tokens"
          value={count(totals.total_tokens)}
          note={`Observed in ${coverage(totals.token_observations.total, totals.interactions)}`}
          icon={<Layers3 size={16} />}
        />
        <Metric
          label="Application payload"
          value={bytes(combinedBytes)}
          note={`${bytes(totals.request_bytes)} sent · ${bytes(totals.response_bytes)} received`}
          icon={<ArrowDownLeft size={16} />}
        />
        <Metric
          label="Estimated cost"
          value={cost(totals.estimated_cost, totals.cost_currency)}
          note={
            totals.priced_interactions
              ? `Priced for ${coverage(totals.priced_interactions, totals.interactions)} · not a bill`
              : "No complete rate and usage estimate"
          }
          icon={<Coins size={16} />}
          amber
        />
      </div>
      {!hasRequests && (
        <div className="ops-panel">
          <EmptyState
            title="Nothing to measure yet"
            action={
              onOpenProviders ? (
                <button className="ops-button" onClick={onOpenProviders}>
                  Review provider connections
                  <ArrowRight size={14} />
                </button>
              ) : undefined
            }
          >
            Send a request through OMNI to build a measured history. If history
            is disabled or has been cleared, these totals do not represent
            earlier activity.
          </EmptyState>
        </div>
      )}
      {hasRequests && (
        <>
          <div className="ops-panel">
            <div className="ops-panel-header">
              <div>
                <h2>Model activity</h2>
                <p>
                  Separate provider connections remain separate, even when they
                  use the same model name.
                </p>
              </div>
              <span>{count(models.length)} model connections</span>
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Model / provider</th>
                    <th className="ops-number">Requests</th>
                    <th className="ops-number">Input / output tokens</th>
                    <th className="ops-number">Cache read / write</th>
                    <th className="ops-number">Payload out / in</th>
                    <th className="ops-number">Estimated cost</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={`${model.provider_id}:${model.model}`}>
                      <td>
                        <strong className="ops-cell-main">
                          {model.model || "Unspecified model"}
                        </strong>
                        <span className="ops-cell-sub">
                          {model.provider_name || model.provider_id}
                        </span>
                      </td>
                      <td className="ops-number">
                        {count(model.totals.interactions)}
                        <span className="ops-cell-sub">
                          {count(model.totals.succeeded)} succeeded
                        </span>
                      </td>
                      <td className="ops-number">
                        {count(model.totals.input_tokens)} /{" "}
                        {count(model.totals.output_tokens)}
                        <span className="ops-cell-sub">
                          Input:{" "}
                          {coverage(
                            model.totals.token_observations.input,
                            model.totals.interactions,
                          )}
                        </span>
                      </td>
                      <td className="ops-number">
                        {count(model.totals.cached_tokens)} /{" "}
                        {count(model.totals.cache_write_tokens)}
                        <span className="ops-cell-sub">
                          Provider-reported only
                        </span>
                      </td>
                      <td className="ops-number">
                        {bytes(model.totals.request_bytes)} /{" "}
                        {bytes(model.totals.response_bytes)}
                        <span className="ops-cell-sub">Application bodies</span>
                      </td>
                      <td className="ops-number">
                        {cost(
                          model.totals.estimated_cost,
                          model.totals.cost_currency,
                        )}
                        <span className="ops-cell-sub">
                          {coverage(
                            model.totals.priced_interactions,
                            model.totals.interactions,
                          )}{" "}
                          priced
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="ops-two-column">
            <article className="ops-panel">
              <div className="ops-panel-header">
                <div>
                  <h2>Where requests go</h2>
                  <p>Share of recorded requests in this period.</p>
                </div>
                <Activity size={16} color="#8dac99" />
              </div>
              <div className="ops-breakdown">
                {models.map((model) => (
                  <div
                    className="ops-breakdown-row"
                    key={`${model.provider_id}:${model.model}`}
                  >
                    <div className="ops-breakdown-heading">
                      <strong>{model.model || "Unspecified model"}</strong>
                      <span>
                        {count(model.totals.interactions)} requests ·{" "}
                        {(
                          (model.totals.interactions / totals.interactions) *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                    <div className="ops-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${(model.totals.interactions / totals.interactions) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="ops-breakdown-meta">
                      <span>{model.provider_name || model.provider_id}</span>
                      <span>{count(model.totals.failed)} failed</span>
                      <span>{count(model.totals.aborted)} aborted</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="ops-panel">
              <div className="ops-panel-header">
                <div>
                  <h2>Measurement coverage</h2>
                  <p>Missing counters are not treated as zero.</p>
                </div>
                <Info size={16} color="#8dac99" />
              </div>
              <div className="ops-compact-list">
                <div>
                  <span>Input tokens observed</span>
                  <strong>
                    {coverage(
                      totals.token_observations.input,
                      totals.interactions,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Output tokens observed</span>
                  <strong>
                    {coverage(
                      totals.token_observations.output,
                      totals.interactions,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Cache reads observed</span>
                  <strong>
                    {coverage(
                      totals.token_observations.cached,
                      totals.interactions,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Cache writes observed</span>
                  <strong>
                    {coverage(
                      totals.token_observations.cache_write,
                      totals.interactions,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Cost estimated</span>
                  <strong>
                    {coverage(totals.priced_interactions, totals.interactions)}
                  </strong>
                </div>
                <div>
                  <span>Pending / streaming</span>
                  <strong>
                    {count(totals.pending)} / {count(totals.streaming)}
                  </strong>
                </div>
              </div>
              {onOpenProviders &&
                totals.priced_interactions < totals.interactions && (
                  <div className="ops-method">
                    <p>
                      Missing rates or incomplete provider counters leave a
                      request unpriced. Configure rates for future requests;
                      estimates use the rate snapshot recorded for each request.
                    </p>
                    <button
                      className="ops-button"
                      style={{ marginTop: 14 }}
                      onClick={onOpenProviders}
                    >
                      Review rates
                      <ArrowRight size={13} />
                    </button>
                  </div>
                )}
            </article>
          </div>
        </>
      )}
      <div className="ops-two-column">
        <article className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Context size comparison</h2>
              <p>Source material versus selected context.</p>
            </div>
            <span>BENCHMARK</span>
          </div>
          <div className="ops-method">
            {comparison.interactions > 0 ? (
              <>
                <div className="ops-comparison">
                  <div>
                    <span className="ops-label">Source baseline</span>
                    <strong>{bytes(comparison.source_bytes_baseline)}</strong>
                    <small>Associated source material</small>
                  </div>
                  <div>
                    <span className="ops-label">Inserted context</span>
                    <strong>{bytes(comparison.context_bytes)}</strong>
                    <small>Context included in requests</small>
                  </div>
                </div>
                <p>
                  <strong style={{ color: "#bfd3bd", fontWeight: 500 }}>
                    {known(comparison.reduction_percent)
                      ? `${Math.abs(comparison.reduction_percent).toFixed(1)}% ${comparison.reduction_percent < 0 ? "larger" : "smaller"}`
                      : "No comparable percentage"}
                  </strong>{" "}
                  across {count(comparison.interactions)} requests with a source
                  baseline.{" "}
                  {comparison.byte_reduction < 0
                    ? "Selected context exceeded the source baseline."
                    : "The difference compares two representations of context."}
                </p>
              </>
            ) : (
              <p>
                No comparable source baseline has been recorded in this period.
                Ordinary requests without a source comparison do not imply any
                compression or saving.
              </p>
            )}
            <div
              className="ops-note"
              style={{ marginTop: 18, marginBottom: 0 }}
            >
              <Info size={15} />
              <span>
                This is not measured bandwidth saved, reduced billing or proof
                of equal answer quality. Source text is a comparison baseline;
                it was not necessarily going to be sent.
              </span>
            </div>
          </div>
        </article>
        <article className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Read the numbers precisely</h2>
              <p>Evidence before an efficiency claim.</p>
            </div>
            <ShieldCheck size={16} color="#8dac99" />
          </div>
          <div className="ops-method">
            <p>
              <strong style={{ color: "#bed0bf", fontWeight: 500 }}>
                Payloads.
              </strong>{" "}
              Sent and received bytes are application bodies, excluding protocol
              and tunnel overhead. Partial streams may have incomplete counts.
            </p>
            <p style={{ marginTop: 15 }}>
              <strong style={{ color: "#bed0bf", fontWeight: 500 }}>
                Tokens.
              </strong>{" "}
              Usage totals sum only counters reported by providers. Context
              estimates use UTF-8 byte length divided by four, rounded up; they
              are not billed-token measurements.
            </p>
            <p style={{ marginTop: 15 }}>
              <strong style={{ color: "#bed0bf", fontWeight: 500 }}>
                Cost.
              </strong>{" "}
              Estimates depend on manually configured rate snapshots and
              complete relevant usage. No estimate is inferred from a missing
              price or cache counter.
            </p>
            <p style={{ marginTop: 15 }}>
              Period:{" "}
              {data.from ? time(data.from, true) : "All retained history"} →{" "}
              {time(data.until, true)}.
            </p>
          </div>
        </article>
      </div>
    </>
  );
}
