import { useEffect, useState } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  Plus,
  Trash2,
  Save,
  Play,
  RefreshCw,
  FileText,
  ArrowDown,
  Check,
  ShieldAlert,
} from "lucide-react";
import { readTextFiles, textFileTypes, type TextAttachment } from "./files";
import { dateLabel } from "./api";
import "./policies.css";

type Rule = {
  id: string;
  name: string;
  pattern: string;
  action: "block_match" | "require_match";
  enabled: boolean;
};
type Policy = {
  name: string;
  max_request_bytes: number;
  max_file_bytes: number;
  max_files: number;
  allowed_extensions: string[];
  rules: Rule[];
};
type Snapshot = {
  revision: number;
  policy: Policy;
  managed: Policy | null;
  managed_fingerprint: string | null;
};
type Decision = {
  id: string;
  created_at: string;
  allowed: boolean;
  operation: string;
  revision: number;
  layer: string;
  reason: string;
  rule_id: string | null;
  request_bytes: number;
  file_count: number;
};
type Decisions = {
  items: Decision[];
  retained: number;
  blocked: number;
  retention_limit: number;
};
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
const descriptions: Record<string, string> = {
  allowed: "Allowed",
  blocked_pattern: "Blocked text pattern",
  required_pattern_missing: "Required pattern missing",
  request_too_large: "Request exceeds size limit",
  too_many_files: "Too many files",
  file_type_not_allowed: "File type not allowed",
  file_too_large: "File exceeds size limit",
  invalid_file_name: "Invalid file name",
  file_media_type_mismatch: "File type and media type differ",
  uninspectable_file: "File cannot be inspected as text",
  invalid_json_file: "Invalid JSON file",
  opaque_attachment_not_supported: "Opaque or binary attachment",
  content_too_deep: "Content nesting exceeds limit",
};
const describe = (code: string) => descriptions[code] || code;

export default function Policies({ request }: { request: Request }) {
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [decisions, setDecisions] = useState<Decisions | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState("A concise project update.");
  const [files, setFiles] = useState<TextAttachment[]>([]);
  const [preview, setPreview] = useState<Decision | null>(null);
  const dirty =
    !!draft &&
    !!saved &&
    JSON.stringify(draft) !== JSON.stringify(saved.policy);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      request<Snapshot>("/api/policies", { signal: controller.signal }),
      request<Decisions>("/api/policies/decisions", {
        signal: controller.signal,
      }),
    ])
      .then(([value, recent]) => {
        if (!controller.signal.aborted) {
          setSaved(value);
          setDraft(structuredClone(value.policy));
          setDecisions(recent);
        }
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [request]);
  const update = (patch: Partial<Policy>) => {
    setDraft((value) => value && { ...value, ...patch });
    setNotice("");
  };
  const ruleUpdate = (index: number, patch: Partial<Rule>) =>
    update({
      rules: draft!.rules.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule,
      ),
    });
  async function save() {
    if (!draft || !saved) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await request<Snapshot>("/api/policies", {
        method: "POST",
        body: JSON.stringify({
          expected_revision: saved.revision,
          policy: draft,
        }),
      });
      setSaved(value);
      setDraft(structuredClone(value.policy));
      setPreview(null);
      setNotice(
        `Policy saved. Revision ${value.revision} applies to new requests.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError("");
    try {
      const [value, recent] = await Promise.all([
        request<Snapshot>("/api/policies"),
        request<Decisions>("/api/policies/decisions"),
      ]);
      setSaved(value);
      setDraft(structuredClone(value.policy));
      setDecisions(recent);
      setPreview(null);
      setNotice("Saved policy loaded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const value = await request<Decision>("/api/policies/test", {
        method: "POST",
        body: JSON.stringify({
          body: { messages: [{ role: "user", content: sample }] },
          attachments: files,
        }),
      });
      setPreview(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const addRule = (preset = false) => {
    if (!draft) return;
    update({
      rules: [
        ...draft.rules,
        {
          id: crypto.randomUUID(),
          name: preset ? "Block private key headers" : "New content rule",
          pattern: preset ? "-----BEGIN [A-Z ]*PRIVATE KEY-----" : "",
          action: "block_match",
          enabled: true,
        },
      ],
    });
  };
  const active =
    (draft?.rules.filter((rule) => rule.enabled).length || 0) +
    (saved?.managed?.rules.filter((rule) => rule.enabled).length || 0);
  return (
    <section className="policies-page">
      <header className="policy-hero">
        <div>
          <span className="eyebrow">REQUEST CONTROL</span>
          <h1>
            Your rules.
            <br />
            <span>Every request.</span>
          </h1>
          <p>
            Decide what can leave your space. The local engine checks content,
            files and authorized context before a model receives them.
          </p>
        </div>
        <div className="policy-emblem">
          <ShieldCheck size={54} strokeWidth={1} />
          <span>
            {saved?.managed ? "ORGANIZATION + LOCAL" : "LOCAL AUTHORITY"}
          </span>
        </div>
      </header>
      {error && (
        <div className="policy-feedback error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="policy-feedback success" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {!draft || !saved ? (
        <div className="policy-panel">
          <p>
            {error
              ? "The policy could not be loaded. Your drafts and saved data have not been changed."
              : "Opening your policy…"}
          </p>
          <button onClick={() => void reload()} disabled={busy}>
            <RefreshCw size={15} /> Reload policy
          </button>
        </div>
      ) : (
        <>
          <div className="policy-summary">
            <div>
              <span>Active content rules{dirty ? " · draft" : ""}</span>
              <strong>{active}</strong>
            </div>
            <div>
              <span>Blocked / retained decisions</span>
              <strong>
                {decisions?.blocked || 0}
                <small> / {decisions?.retained || 0}</small>
              </strong>
            </div>
            <div>
              <span>Saved local revision</span>
              <strong>{saved.revision.toString().padStart(2, "0")}</strong>
            </div>
          </div>
          {saved.managed && (
            <section className="policy-panel managed-policy">
              <div className="policy-section-title">
                <div>
                  <span className="eyebrow">MANAGED BASELINE</span>
                  <h2>
                    <LockKeyhole size={20} /> {saved.managed.name}
                  </h2>
                </div>
                <span className="policy-tag">Read only</span>
              </div>
              <p>
                Provisioned by your administrator. Local rules can add
                restrictions; they cannot override this baseline.
              </p>
              <div className="policy-managed-limits">
                <span>
                  {saved.managed.max_request_bytes.toLocaleString()} request
                  bytes
                </span>
                <span>
                  {saved.managed.max_files} files ·{" "}
                  {saved.managed.max_file_bytes.toLocaleString()} bytes each
                </span>
                <span>
                  {saved.managed.allowed_extensions.length
                    ? saved.managed.allowed_extensions.join(", ")
                    : "No file types allowed"}
                </span>
              </div>
              <details>
                <summary>Inspect organization rules</summary>
                {saved.managed.rules.map((rule) => (
                  <div className="policy-managed-rule" key={rule.id}>
                    <strong>{rule.name}</strong>
                    <span>
                      {rule.enabled
                        ? rule.action === "block_match"
                          ? "Block match"
                          : "Require match"
                        : "Disabled"}
                    </span>
                    <code>{rule.pattern}</code>
                    <small>{rule.id}</small>
                  </div>
                ))}
                <p className="policy-caption">
                  Fingerprint: {saved.managed_fingerprint}
                </p>
              </details>
            </section>
          )}
          <div className="policy-workspace">
            <div className="policy-editor">
              <section className="policy-panel">
                <div className="policy-section-title">
                  <div>
                    <span className="eyebrow">01 / CONTENT</span>
                    <h2>Build your rule chain.</h2>
                  </div>
                  <ShieldCheck size={21} />
                </div>
                <p>
                  Block rules take priority. Every enabled require rule must
                  match. Expressions inspect decoded JSON string values,
                  including history, tool arguments and added memory.
                </p>
                <label className="policy-field">
                  Policy name
                  <input
                    aria-label="Policy name"
                    value={draft.name}
                    disabled={busy}
                    onChange={(e) => update({ name: e.target.value })}
                    maxLength={100}
                  />
                </label>
                {draft.rules.length === 0 && (
                  <div className="policy-empty">
                    <ShieldCheck size={26} />
                    <strong>No content rules yet.</strong>
                    <p>
                      File and size limits already apply. Add a pattern to
                      control request content.
                    </p>
                  </div>
                )}
                {draft.rules.map((rule, index) => (
                  <div className="policy-rule" key={rule.id}>
                    <div className="policy-rule-top">
                      <span className="policy-step">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <input
                        aria-label={`Rule ${index + 1} name`}
                        value={rule.name}
                        maxLength={100}
                        disabled={busy}
                        onChange={(e) =>
                          ruleUpdate(index, { name: e.target.value })
                        }
                      />
                      <button
                        aria-label={`Remove rule ${index + 1}`}
                        disabled={busy}
                        onClick={() =>
                          update({
                            rules: draft.rules.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="policy-rule-options">
                      <select
                        aria-label={`Rule ${index + 1} action`}
                        value={rule.action}
                        disabled={busy}
                        onChange={(e) =>
                          ruleUpdate(index, {
                            action: e.target.value as Rule["action"],
                          })
                        }
                      >
                        <option value="block_match">
                          Block matching content
                        </option>
                        <option value="require_match">
                          Require matching content
                        </option>
                      </select>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Enable rule ${index + 1}`}
                          checked={rule.enabled}
                          disabled={busy}
                          onChange={(e) =>
                            ruleUpdate(index, { enabled: e.target.checked })
                          }
                        />{" "}
                        Enabled
                      </label>
                    </div>
                    <textarea
                      aria-label={`Rule ${index + 1} pattern`}
                      rows={2}
                      value={rule.pattern}
                      spellCheck={false}
                      placeholder="Enter a Rust regular expression"
                      disabled={busy}
                      onChange={(e) =>
                        ruleUpdate(index, { pattern: e.target.value })
                      }
                      maxLength={2048}
                    />
                    <small>Rule ID · {rule.id}</small>
                    {index + 1 < draft.rules.length && (
                      <ArrowDown className="policy-chain-arrow" size={14} />
                    )}
                  </div>
                ))}
                <div className="policy-actions">
                  <button
                    disabled={busy || draft.rules.length >= 32}
                    onClick={() => addRule()}
                  >
                    <Plus size={15} /> Add rule
                  </button>
                  <button
                    disabled={busy || draft.rules.length >= 32}
                    onClick={() => addRule(true)}
                  >
                    Example: private key header
                  </button>
                </div>
                <p className="policy-caption">
                  At most 32 rules. Rust regex uses bounded compilation and no
                  backtracking. This is deterministic text matching, not a
                  guarantee against prompt injection or encoded secrets.
                </p>
              </section>
              <section className="policy-panel">
                <div className="policy-section-title">
                  <div>
                    <span className="eyebrow">02 / FILES & VOLUME</span>
                    <h2>Keep the boundary clear.</h2>
                  </div>
                  <FileText size={21} />
                </div>
                <p>
                  Allow only the UTF-8 file types your workflow needs. Binary
                  uploads, remote file URLs and provider file IDs are rejected.
                </p>
                <div className="policy-file-types">
                  {Object.keys(textFileTypes).map((extension) => (
                    <label
                      className={
                        draft.allowed_extensions.includes(extension)
                          ? "selected"
                          : ""
                      }
                      key={extension}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Allow .${extension} files`}
                        checked={draft.allowed_extensions.includes(extension)}
                        disabled={busy}
                        onChange={(e) =>
                          update({
                            allowed_extensions: e.target.checked
                              ? [...draft.allowed_extensions, extension]
                              : draft.allowed_extensions.filter(
                                  (value) => value !== extension,
                                ),
                          })
                        }
                      />
                      <span>.{extension}</span>
                    </label>
                  ))}
                </div>
                <div className="policy-limits">
                  <label>
                    Files per request
                    <input
                      type="number"
                      aria-label="Maximum files"
                      min={0}
                      max={8}
                      value={draft.max_files}
                      disabled={busy}
                      onChange={(e) =>
                        update({ max_files: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Bytes per file
                    <input
                      type="number"
                      aria-label="Maximum file bytes"
                      min={1}
                      max={100000}
                      value={draft.max_file_bytes}
                      disabled={busy}
                      onChange={(e) =>
                        update({ max_file_bytes: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Bytes per request
                    <input
                      type="number"
                      aria-label="Maximum request bytes"
                      min={1024}
                      max={1048576}
                      value={draft.max_request_bytes}
                      disabled={busy}
                      onChange={(e) =>
                        update({ max_request_bytes: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <p className="policy-caption">
                  Request limits include the complete outbound JSON and injected
                  context. Historical files are checked again. Zero files
                  disables attachments.
                </p>
              </section>
              <div className="policy-save-bar">
                <span>
                  {dirty ? "Unsaved changes" : "Saved policy is active"}
                </span>
                <div>
                  <button disabled={busy} onClick={() => void reload()}>
                    <RefreshCw size={15} />{" "}
                    {dirty ? "Discard edits & reload" : "Refresh"}
                  </button>
                  <button
                    className="policy-primary"
                    disabled={busy || !dirty}
                    onClick={() => void save()}
                  >
                    <Save size={15} /> Save policy
                  </button>
                </div>
              </div>
            </div>
            <aside className="policy-panel policy-tester">
              <span className="eyebrow">TRY THE BOUNDARY</span>
              <h2>Test before you send.</h2>
              <p>
                Run a local sample against the saved policy and any managed
                baseline. Nothing is sent to a model or added to the decision
                log.
              </p>
              <label className="policy-field">
                Sample request
                <textarea
                  aria-label="Policy sample"
                  rows={7}
                  value={sample}
                  onChange={(e) => {
                    setSample(e.target.value);
                    setPreview(null);
                  }}
                  maxLength={100000}
                />
              </label>
              <label className="policy-file-input">
                <FileText size={16} /> Add test files
                <input
                  aria-label="Policy test files"
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json,.log,.yaml,.yml"
                  onChange={(e) => {
                    const selected = e.target.files;
                    if (selected)
                      void readTextFiles(selected)
                        .then((value) => {
                          setFiles(value);
                          setPreview(null);
                        })
                        .catch((e: Error) => setError(e.message));
                    e.target.value = "";
                  }}
                />
              </label>
              {files.length > 0 && (
                <div className="policy-test-files">
                  {files.map((file, index) => (
                    <span key={index}>
                      {file.name}
                      <button
                        aria-label={`Remove test file ${index + 1}`}
                        onClick={() => {
                          setFiles(files.filter((_, i) => i !== index));
                          setPreview(null);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button
                className="policy-primary"
                disabled={busy}
                onClick={() => void test()}
              >
                <Play size={15} /> Test saved policy
              </button>
              {dirty && (
                <p className="policy-caption">
                  Save your edits to include them in this test.
                </p>
              )}
              {preview && (
                <div
                  role="status"
                  className={`policy-verdict ${preview.allowed ? "allowed" : "blocked"}`}
                >
                  {preview.allowed ? (
                    <ShieldCheck size={24} />
                  ) : (
                    <ShieldAlert size={24} />
                  )}
                  <strong>
                    {preview.allowed
                      ? "This sample is allowed."
                      : "This sample is blocked."}
                  </strong>
                  <span>{describe(preview.reason)}</span>
                  {preview.rule_id && <code>{preview.rule_id}</code>}
                  <small>
                    {preview.layer} policy · revision {preview.revision}
                  </small>
                </div>
              )}
              <p className="policy-caption">
                Actual requests also contain their model settings, conversation
                history and authorized memory. A passing sample does not
                authorize a later request.
              </p>
            </aside>
          </div>
          <section className="policy-panel">
            <div className="policy-section-title">
              <div>
                <span className="eyebrow">DECISION TRAIL</span>
                <h2>What crossed the boundary.</h2>
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void request<Decisions>("/api/policies/decisions")
                    .then(setDecisions)
                    .catch((e: Error) => setError(e.message))
                }
              >
                <RefreshCw size={15} /> Refresh decisions
              </button>
            </div>
            <p>
              Up to 100 recent decisions from the last 1,000 retained. An
              allowed decision records the policy check, not successful
              delivery. No prompts, file names or matched text are stored here.
            </p>
            {decisions?.items.length ? (
              <div className="policy-decisions">
                {decisions.items.map((decision) => (
                  <details key={decision.id}>
                    <summary>
                      <span
                        className={`policy-dot ${decision.allowed ? "allowed" : "blocked"}`}
                      />
                      <strong>{describe(decision.reason)}</strong>
                      <span>{decision.operation}</span>
                      <time>{dateLabel(decision.created_at)}</time>
                    </summary>
                    <div className="policy-decision-detail">
                      <span>
                        Decision <code>{decision.id}</code>
                      </span>
                      <span>
                        {decision.layer} policy · local revision{" "}
                        {decision.revision}
                      </span>
                      {decision.rule_id && (
                        <span>
                          Rule <code>{decision.rule_id}</code>
                        </span>
                      )}
                      <span>
                        {decision.request_bytes.toLocaleString()} bytes ·{" "}
                        {decision.file_count} files
                      </span>
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="policy-empty">
                <ShieldCheck size={26} />
                <strong>No decisions yet.</strong>
                <p>
                  Your next request through OMNI will create a metadata receipt
                  here.
                </p>
              </div>
            )}
          </section>
          <p className="policy-caption policy-boundary-note">
            <LockKeyhole size={14} /> Policies govern requests routed through
            OMNI. Managed deployment also needs OS and network controls to
            prevent direct provider access. This MVP does not include MDM, SSO,
            a fleet console or response-content filtering.
          </p>
        </>
      )}
    </section>
  );
}
