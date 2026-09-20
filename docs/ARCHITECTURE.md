# Architecture and transaction paths

This is the concise implementation map. Read the [architecture book](../ARCHITECTURE.md) for the doctrine, trust boundaries and target design, and the [diagram collection](../DIAGRAMS.md) for the current and planned flows.

## Authorized AI transaction

```mermaid
sequenceDiagram
  actor User
  participant UI as Console / integrated agent
  participant Core as Local Rust gateway
  participant DB as SQLCipher vault
  participant VPN as WireGuard + private relay
  participant LLM as Chosen provider
  participant DP as Local OpenDP engine
  User->>UI: Choose destination and memory scope
  UI->>Core: Request with grant identifier
  Core->>DB: Check credential, scope, expiry and revocation
  DB-->>Core: Allowed context only
  Core->>DB: Record disclosure authorization
  Core->>VPN: TLS connection to provider
  VPN->>LLM: Forward encrypted TLS bytes
  LLM-->>VPN: TLS response stream
  VPN-->>Core: TLS response stream
  Core-->>UI: Response, including streaming events
  Core->>DB: Store local usage observation
  DB->>DP: Fixed bounded histograms on explicit opt-in release
```

Local inference uses a loopback provider and does not require the tunnel. When VPN routing is configured, the gateway must use the configured SOCKS transport without direct fallback. A failed tunnel is an error, not authorization to bypass it.

## Data model

```mermaid
erDiagram
  SOURCE ||--o{ MEMORY : supports
  MEMORY }o--o{ GRANT : selected_by
  GRANT ||--o{ DISCLOSURE : authorizes
  MEMORY }o--o{ DISCLOSURE : included_in
  OBSERVATION }o--|| WEEKLY_REPORT : contributes_locally
  PRIVACY_LEDGER ||--o{ WEEKLY_REPORT : accounts_for
  SOURCE {
    string id
    string provenance
    string content
    string created_at
  }
  MEMORY {
    string id
    string source_id
    string content
    string status
    string updated_at
  }
  GRANT {
    string id
    string destination
    string scope
    string expires_at
    bool revoked
  }
  DISCLOSURE {
    string id
    string grant_id
    string destination
    string memory_ids
    string created_at
  }
  OBSERVATION {
    string category
    int latency_bin
    int token_bin
  }
  WEEKLY_REPORT {
    string report_id
    string week
    float epsilon
    string noised_histograms
  }
  PRIVACY_LEDGER {
    float epsilon_spent
    int reports_released
  }
```

The diagram is the logical model; JSON arrays may represent scope and memory references in SQLite. The private database stores detailed observations. The central store receives only noised report values and persists **aggregated sums/counts plus deduplication hashes**, not an individual searchable conversation store.

## Synthetic end-to-end laboratory

```mermaid
flowchart TB
  Scenario[Scenario orchestrator · synthetic data only]
  Scenario --> A[Client 1 · separate SQLCipher vault]
  Scenario --> B[Client 2 … 6 · separate vaults and grants]
  A --> FakeLocal[Loopback local LLM fixture]
  B --> FakeSaaS[Loopback SaaS LLM fixture]
  Scenario --> Crypto[Six BoringTun peers · real localhost UDP]
  Crypto --> Knock[Authenticated knock / replay rejection]
  Knock --> Hub[Synthetic WireGuard hub]
  Hub --> FakeLocal
  Hub --> FakeSaaS
  A --> Noise[OpenDP reports]
  B --> Noise
  Noise --> Collect[Collector + duplicate/rejection tests]
  Crypto --> Rotation[Accelerated 30-minute clock / new key handshake]
  Collect --> Evidence[Machine-readable report]
  Rotation --> Evidence
```

Two paths are deliberately tested separately: the application path checks memory, grants, provider protocol and analytics; the cryptographic path sends synthetic tasks through encrypted WireGuard packets to loopback provider fixtures. The simulator never claims that a host-wide VPN or a public SaaS deployment was installed. Its accelerated clock avoids waiting thirty real minutes and records the rotation assertions.

## Process and trust boundaries

The collector is a separate process and deployment from the core. The local model runtime is a separate service. Database and authorization operations are modules of the local core in this development release; this is **not yet an OS-isolated vault worker**. Local code compromise can access the unlocked vault. Native signed helper confinement requires additional deployment work and must not be inferred from module names.

## Ports

| Service | Default binding | Purpose |
|---|---|---|
| Nebula | 127.0.0.1:3006 | Local UI |
| Core | 127.0.0.1:3007 | Authenticated memory and gateway |
| Collector | 127.0.0.1:3008 | Noised telemetry and public aggregates |
| Synthetic providers | 127.0.0.1:4101–4102 | Test-only local/SaaS fixtures |
| Synthetic clients | 127.0.0.1:4201–4216 | Isolated test processes |
| WireGuard / knock / relay | Deployment configuration | See VPN guide |
