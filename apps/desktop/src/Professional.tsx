import { useCallback, useEffect, useRef, useState } from "react";
import {
  Fingerprint,
  KeyRound,
  MessageSquare,
  ShieldCheck,
  Download,
  Trash2,
} from "lucide-react";
import type { AdminState } from "./Administration";
import { CORE, dateLabel, isActive, type CoreState } from "./api";
import { nativeGateway, nativeSession, saveMetadata } from "./native";
import "./professional.css";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type Client = {
  id: string;
  label: string;
  destinations: string[];
  expires_at: string;
  revoked_at: string | null;
};
type Workspace = {
  instance_id: string;
  label: string;
  enabled: boolean;
  clients: Client[];
  requests: {
    interaction_id: string;
    principal_id: string;
    receipt_id: string | null;
    preflight_us: number;
    policy_us: number;
  }[];
};
type Conversation = {
  id: string;
  title: string;
  scope: string;
  provider_id: string;
  destination: string;
  model: string;
  grant_id: string | null;
  expires_at: string;
  revision: number;
  pending_request: string | null;
};
type Thread = {
  conversation: Conversation;
  turns: {
    request_id: string;
    human_statement: string;
    model_suggestion: string;
    receipt_id: string | null;
  }[];
  selection: string;
};
const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export default function Professional({
  request,
  admin,
  core,
  onChanged,
}: {
  request: Request;
  admin: AdminState | null;
  core: CoreState;
  onChanged: () => Promise<void>;
}) {
  const [work, setWork] = useState<Workspace | null>(null);
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [label, setLabel] = useState("My work installation"),
    [enroll, setEnroll] = useState(false);
  const [clientLabel, setClientLabel] = useState(""),
    [destination, setDestination] = useState(""),
    [lifetime, setLifetime] = useState(24);
  const [credential, setCredential] = useState<{
    token: string;
    id: string;
  } | null>(null);
  const [clientId, setClientId] = useState(""),
    [memoryIds, setMemoryIds] = useState<string[]>([]);
  const [gateway, setGateway] = useState<{
    enabled: boolean;
    address: string | null;
  } | null>(null);
  const [title, setTitle] = useState(""),
    [scope, setScope] = useState(""),
    [providerId, setProviderId] = useState("");
  const [model, setModel] = useState(""),
    [grantId, setGrantId] = useState(""),
    [retention, setRetention] = useState(7),
    [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(""),
    [acknowledge, setAcknowledge] = useState(false);
  const [passphrase, setPassphrase] = useState(""),
    [repeat, setRepeat] = useState(""),
    [archive, setArchive] = useState<File | null>(null),
    [restoreAck, setRestoreAck] = useState(false);
  const alive = useRef(true);
  const providers =
    admin?.providers.filter((p) => p.enabled && p.policy_allowed !== false) ??
    [];
  const provider = providers.find((p) => p.id === providerId);
  const client = work?.clients.find((c) => c.id === clientId);
  const availableGrants = core.grants.filter(
    (g) => isActive(g) && !g.client_id && g.destination === provider?.base_url,
  );
  const reload = useCallback(async () => {
    const [workspace, saved] = await Promise.all([
      request<Workspace>("/api/work"),
      request<{ conversations: Conversation[] }>("/api/conversations"),
    ]);
    if (alive.current) {
      setWork(workspace);
      setThreads(saved.conversations);
    }
  }, [request]);
  useEffect(() => {
    alive.current = true;
    void reload().catch((e) => alive.current && setError(e.message));
    if (nativeSession?.mode === "embedded")
      void nativeGateway()
        .then((g) => alive.current && setGateway(g))
        .catch((e) => alive.current && setError(e.message));
    return () => {
      alive.current = false;
    };
  }, [reload]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (alive.current) {
        await reload();
        await onChanged();
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "The operation could not finish.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function openThread(id: string) {
    const value = await request<Thread>(`/api/conversations/${id}`);
    if (alive.current) {
      setThread(value);
      setAcknowledge(false);
    }
  }
  const embedded = nativeSession?.mode === "embedded";
  return (
    <div className="professional">
      <div className="work-intro">
        <span className="eyebrow">OMNI / WORK</span>
        <h2>Context with clear authority.</h2>
        <p>
          One owner. One installation. Every client approved, every remembered
          conversation chosen.
        </p>
      </div>
      {error && (
        <div className="work-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="work-notice" role="status">
          {notice}
        </div>
      )}
      <fieldset disabled={busy} className="work-fields">
        <section className="work-card">
          <div className="work-heading">
            <Fingerprint size={22} />
            <div>
              <h3>Your work installation</h3>
              <p>A dedicated device or OS user account for one owner.</p>
            </div>
            <span className="work-badge">
              {work?.enabled ? "Enrolled" : "Not enrolled"}
            </span>
          </div>
          <p>
            Work mode disables the legacy integration token. It does not
            separate personal data already in this vault. Use a dedicated
            installation before adding work information. This is not an
            organisation-wide shared service.
          </p>
          {work?.enabled ? (
            <dl className="work-meta">
              <div>
                <dt>Name</dt>
                <dd>{work.label}</dd>
              </div>
              <div>
                <dt>Installation</dt>
                <dd>
                  <code>{work.instance_id}</code>
                </dd>
              </div>
            </dl>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await request(
                    "/api/work",
                    json({ label, acknowledge_single_owner: enroll }),
                  );
                  setNotice(
                    "Work authority enabled. Approve clients individually below.",
                  );
                });
              }}
            >
              <label>
                Installation name
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                  maxLength={120}
                />
              </label>
              <label className="work-check">
                <input
                  type="checkbox"
                  checked={enroll}
                  onChange={(e) => setEnroll(e.target.checked)}
                />
                This installation belongs to one OS user and is dedicated to
                work.
              </label>
              <button className="primary" disabled={!enroll}>
                Enable work authority
              </button>
            </form>
          )}
        </section>
        <section className="work-card">
          <div className="work-heading">
            <KeyRound size={22} />
            <div>
              <h3>Approved clients</h3>
              <p>Give each API client its own destination and expiry.</p>
            </div>
          </div>
          <div className="work-gateway">
            <div>
              <strong>
                {embedded
                  ? gateway?.enabled
                    ? "Local gateway is open"
                    : "Local gateway is closed"
                  : "Development gateway"}
              </strong>
              <p>
                {embedded
                  ? "Opt in to allow approved clients on this device. Stop it here when finished. App lock does not stop it; quitting does. Mobile background availability is not guaranteed."
                  : "Use this installation's local API endpoint. Keep the owner credential private."}
              </p>
              {(gateway?.address || !embedded) && (
                <code>{embedded ? gateway?.address : CORE}</code>
              )}
            </div>
            {embedded && (
              <button
                className="secondary"
                disabled={!work?.enabled}
                onClick={() =>
                  void run(async () => {
                    const g = await nativeGateway(!gateway?.enabled);
                    if (alive.current) setGateway(g);
                  })
                }
              >
                {gateway?.enabled
                  ? "Stop local gateway"
                  : "Start local gateway"}
              </button>
            )}
          </div>
          <form
            className="work-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const value = await request<{ id: string; token: string }>(
                  "/api/work/clients",
                  json({
                    label: clientLabel,
                    destinations: [destination],
                    expires_in_seconds: lifetime * 3600,
                  }),
                );
                if (alive.current) {
                  setCredential(value);
                  setClientId(value.id);
                  setClientLabel("");
                }
              });
            }}
          >
            <label>
              Client name
              <input
                value={clientLabel}
                onChange={(e) => setClientLabel(e.target.value)}
                placeholder="My approved client"
                maxLength={120}
                required
              />
            </label>
            <label>
              Destination
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              >
                <option value="">Choose a configured provider</option>
                {[...new Set(providers.map((p) => p.base_url))].map((url) => (
                  <option key={url}>{url}</option>
                ))}
              </select>
            </label>
            <label>
              Access lifetime
              <select
                value={lifetime}
                onChange={(e) => setLifetime(Number(e.target.value))}
              >
                <option value={1}>1 hour</option>
                <option value={24}>24 hours</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
              </select>
            </label>
            <button
              className="primary"
              disabled={!work?.enabled || !destination}
            >
              Approve client
            </button>
          </form>
          {credential && (
            <div className="work-secret">
              <strong>Save this client credential now</strong>
              <p>
                Shown once. Store it in your client's secret store. Anyone
                holding it can use this client's approved access until expiry or
                revocation.
              </p>
              <code>{credential.token}</code>
              <button className="secondary" onClick={() => setCredential(null)}>
                I have stored it securely
              </button>
            </div>
          )}
          <div className="work-list">
            {work?.clients.map((c) => (
              <article key={c.id}>
                <div>
                  <strong>{c.label}</strong>
                  <small>
                    {c.destinations.join(", ")} ·{" "}
                    {c.revoked_at
                      ? "Revoked"
                      : Date.parse(c.expires_at) <= Date.now()
                        ? "Expired"
                        : `Expires ${dateLabel(c.expires_at)}`}
                  </small>
                  <code>{c.id}</code>
                </div>
                <button
                  className="secondary"
                  disabled={!!c.revoked_at}
                  onClick={() =>
                    void run(async () => {
                      await request(`/api/work/clients/${c.id}`, {
                        method: "DELETE",
                      });
                      if (credential?.id === c.id) setCredential(null);
                      setNotice(
                        "Client and its permissions revoked for future requests.",
                      );
                    })
                  }
                >
                  Revoke client
                </button>
              </article>
            ))}
          </div>
          <details>
            <summary>Grant selected memory to a client</summary>
            <p>
              Clients can send prompts without saved memory. A separate
              permission is required to include your confirmed facts.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const g = await request<{ id: string }>(
                    "/api/grants",
                    json({
                      client_id: clientId,
                      destination: client?.destinations[0],
                      scope: memoryIds,
                      expires_in_seconds: 3600,
                    }),
                  );
                  setNotice(
                    `Permission created for one hour. Add X-Omni-Grant: ${g.id} to this client's requests.`,
                  );
                  setMemoryIds([]);
                });
              }}
            >
              <label>
                Client
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                >
                  <option value="">Choose a client</option>
                  {work?.clients
                    .filter(
                      (c) =>
                        !c.revoked_at && Date.parse(c.expires_at) > Date.now(),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </label>
              <div className="work-memories">
                {core.memories
                  .filter((m) => m.status === "confirmed")
                  .map((m) => (
                    <label className="work-check" key={m.id}>
                      <input
                        type="checkbox"
                        checked={memoryIds.includes(m.id)}
                        onChange={(e) =>
                          setMemoryIds((ids) =>
                            e.target.checked
                              ? [...ids, m.id]
                              : ids.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.content}
                    </label>
                  ))}
              </div>
              <button
                className="primary"
                disabled={!client || !memoryIds.length}
              >
                Grant selected context for 1 hour
              </button>
            </form>
          </details>
        </section>
        <section className="work-card">
          <div className="work-heading">
            <MessageSquare size={22} />
            <div>
              <h3>Scoped conversations</h3>
              <p>Save only the conversations you deliberately opt into.</p>
            </div>
          </div>
          <p>
            Each conversation stays with one project label, provider, model and
            permission. The latest complete exchanges are selected in order, up
            to 10 pairs and 40,000 bytes. Model suggestions remain separate from
            your statements.
          </p>
          <details>
            <summary>Start an opted-in conversation</summary>
            <form
              className="work-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const c = await request<Conversation>(
                    "/api/conversations",
                    json({
                      title,
                      scope,
                      provider_id: providerId,
                      model,
                      grant_id: grantId || null,
                      retention_days: retention,
                      consent,
                    }),
                  );
                  await openThread(c.id);
                  setConsent(false);
                  setTitle("");
                });
              }}
            >
              <label>
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Project or purpose
                <input
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Provider
                <select
                  value={providerId}
                  onChange={(e) => {
                    setProviderId(e.target.value);
                    setModel(
                      providers.find((p) => p.id === e.target.value)?.model ??
                        "",
                    );
                    setGrantId("");
                  }}
                  required
                >
                  <option value="">Choose a provider</option>
                  {providers.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Context permission
                <select
                  value={grantId}
                  onChange={(e) => setGrantId(e.target.value)}
                >
                  <option value="">No saved memory</option>
                  {availableGrants.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.scope.length} memories · {g.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Delete after
                <select
                  value={retention}
                  onChange={(e) => setRetention(Number(e.target.value))}
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
              <label className="work-check work-wide">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Store the text of this conversation in my encrypted vault and
                reuse its bounded history with this provider. Retention starts
                now.
              </label>
              <button className="primary" disabled={!consent || !provider}>
                Create conversation
              </button>
            </form>
          </details>
          <div className="work-list">
            {threads.map((c) => (
              <article key={c.id}>
                <button
                  className="work-thread"
                  onClick={() => void run(() => openThread(c.id))}
                >
                  <strong>{c.title}</strong>
                  <small>
                    {c.scope} · {c.model} · expires {dateLabel(c.expires_at)}
                  </small>
                </button>
                <button
                  className="secondary"
                  aria-label={`Delete conversation ${c.title}`}
                  onClick={() =>
                    void run(async () => {
                      await request(`/api/conversations/${c.id}`, {
                        method: "DELETE",
                      });
                      if (thread?.conversation.id === c.id) setThread(null);
                      setNotice(
                        "Conversation deleted from this vault. Provider records and exported backups are separate.",
                      );
                    })
                  }
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </article>
            ))}
          </div>
          {thread && (
            <div className="work-conversation">
              <h4>{thread.conversation.title}</h4>
              <p>
                {thread.conversation.scope} · {thread.conversation.destination}{" "}
                · {thread.conversation.model}
              </p>
              <p>
                Expires {dateLabel(thread.conversation.expires_at)}. Revoking
                its context permission prevents future continuation; start a new
                conversation to change scope.
              </p>
              {thread.turns.map((t) => (
                <article className="work-exchange" key={t.request_id}>
                  <strong>Your statement</strong>
                  <p>{t.human_statement}</p>
                  <strong>Model suggestion</strong>
                  <p>{t.model_suggestion}</p>
                  {t.receipt_id && (
                    <small>
                      Disclosure receipt: {t.receipt_id} · inspect in History
                    </small>
                  )}
                </article>
              ))}
              {thread.conversation.pending_request ? (
                <div className="work-alert">
                  <p>
                    A request is pending or its outcome is uncertain. Inspect
                    History before starting another attempt. The provider may
                    already have received it.
                  </p>
                  <label className="work-check">
                    <input
                      type="checkbox"
                      checked={acknowledge}
                      onChange={(e) => setAcknowledge(e.target.checked)}
                    />
                    I reviewed History and understand that another attempt may
                    duplicate a request.
                  </label>
                  <button
                    className="secondary"
                    disabled={!acknowledge}
                    onClick={() =>
                      void run(async () => {
                        await request(
                          `/api/conversations/${thread.conversation.id}/attempt`,
                          json({
                            request_id: thread.conversation.pending_request,
                            acknowledge_possible_delivery: acknowledge,
                          }),
                        );
                        await openThread(thread.conversation.id);
                      })
                    }
                  >
                    Clear uncertain attempt
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = thread.conversation;
                    void run(async () => {
                      try {
                        const reply = await request<{
                          stored: boolean;
                          reply: string;
                        }>(
                          "/api/chat",
                          json({
                            message,
                            provider_id: c.provider_id,
                            model: c.model,
                            grant_id: c.grant_id,
                            conversation_id: c.id,
                            conversation_revision: c.revision,
                            request_id: crypto.randomUUID(),
                          }),
                        );
                        if (alive.current) {
                          setMessage("");
                          setNotice(
                            reply.stored
                              ? "Reply saved with its original roles."
                              : "Provider answered, but this conversation changed or expired; the reply was not saved.",
                          );
                        }
                      } finally {
                        await openThread(c.id);
                      }
                    });
                  }}
                >
                  <label>
                    Message
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      required
                      maxLength={60000}
                    />
                  </label>
                  <button className="primary" disabled={!message.trim()}>
                    Send and save
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
        <section className="work-card">
          <div className="work-heading">
            <ShieldCheck size={22} />
            <div>
              <h3>Encrypted recovery</h3>
              <p>
                Keep a separate passphrase and test restoration on an unused
                installation.
              </p>
            </div>
          </div>
          <p>
            The archive includes your vault records, saved conversations and
            provider keys. It excludes client credentials and the device vault
            key. Restoring preserves the new installation identity, revokes all
            memory permissions and switches analytics off. Archive limits:
            400,000 bytes of data and 10,000 records; larger vaults fail without
            a partial export.
          </p>
          <label>
            Recovery passphrase
            <input
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              minLength={16}
              maxLength={1024}
            />
          </label>
          <label>
            Repeat passphrase for export
            <input
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              maxLength={1024}
            />
          </label>
          <button
            className="primary"
            disabled={passphrase.length < 16 || passphrase !== repeat}
            onClick={() =>
              void run(async () => {
                try {
                  const value = await request(
                    "/api/recovery/export",
                    json({ passphrase }),
                  );
                  const result = await saveMetadata(
                    `omni-recovery-${new Date().toISOString().replaceAll(":", "-")}.json`,
                    JSON.stringify(value, null, 2),
                    "application/json",
                  );
                  if (alive.current) setNotice(result);
                } finally {
                  setPassphrase("");
                  setRepeat("");
                }
              })
            }
          >
            <Download size={16} />
            Export encrypted archive
          </button>
          <details>
            <summary>Restore into an unused installation</summary>
            <p>
              Existing work is never overwritten. The destination's managed
              policy remains in force. Old client credentials and grants will
              not become active.
            </p>
            <label>
              Archive
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => setArchive(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="work-check">
              <input
                type="checkbox"
                checked={restoreAck}
                onChange={(e) => setRestoreAck(e.target.checked)}
              />
              This is an unused installation. Recovered permissions must be
              approved again.
            </label>
            <button
              className="secondary"
              disabled={!archive || passphrase.length < 16 || !restoreAck}
              onClick={() =>
                void run(async () => {
                  try {
                    if (!archive || archive.size > 900000)
                      throw new Error(
                        "Choose an OMNI recovery archive smaller than 900,000 bytes.",
                      );
                    const value = JSON.parse(await archive.text());
                    await request(
                      "/api/recovery/restore",
                      json({
                        passphrase,
                        archive: value,
                        acknowledge_revoked_access: restoreAck,
                      }),
                    );
                    setThread(null);
                    setCredential(null);
                    setNotice(
                      "Recovery complete. Review restored providers and create new permissions before sharing context.",
                    );
                  } finally {
                    setPassphrase("");
                    setRepeat("");
                  }
                })
              }
            >
              Restore archive
            </button>
          </details>
        </section>
      </fieldset>
      {work && work.requests.length > 0 && (
        <section className="work-card">
          <h3>Recent local checks</h3>
          <p>
            Observed checks before provider delivery. These measurements exclude
            model latency and are not a service-level promise.
          </p>
          <div className="work-table">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Client</th>
                  <th>Local checks</th>
                  <th>Policy checks</th>
                </tr>
              </thead>
              <tbody>
                {work.requests.slice(0, 10).map((r) => (
                  <tr key={r.interaction_id}>
                    <td>
                      <code>{r.interaction_id.slice(0, 8)}</code>
                    </td>
                    <td>
                      {work.clients.find((c) => c.id === r.principal_id)
                        ?.label ?? r.principal_id}
                    </td>
                    <td>{(r.preflight_us / 1000).toFixed(2)} ms</td>
                    <td>{(r.policy_us / 1000).toFixed(2)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
