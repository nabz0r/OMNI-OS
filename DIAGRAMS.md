# OMNI-OS · The Boundaries of Understanding

> A diagram should show what can cross a boundary—and who decides.

These views complement the [architecture guide](ARCHITECTURE.md). **Implemented** describes behavior in this repository. **Target** describes work still to be delivered, with acceptance criteria in the [roadmap](ROADMAP.md). A boundary drawn on a diagram is never, by itself, evidence of operating-system isolation.

## 1. One request, one authorization, one response

**Implemented — explicit application integration.** The native UI reaches its embedded core through authenticated IPC. An application or agent can instead call an explicitly exposed HTTP gateway. The VPN does not reveal the text of an HTTPS conversation. Memory, policy, and the gateway run as modules within the same Rust process, embedded in the native application when that mode is used.

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant UI as Native UI or integrated application
    participant Core as Local OMNI / Rust
    participant Vault as SQLCipher vault
    participant LLM as Selected model

    User->>UI: Asks a question
    UI->>Core: Authenticated IPC or HTTP request / optional grant
    Core->>Core: Checks destination, expiration, and revocation
    alt Supplied grant is invalid
        Core-->>UI: Rejects before calling the provider
        UI-->>User: Authorization needs attention
    else Valid authorization or no memory requested
        opt Valid grant for sharing memory
            Core->>Vault: Selects a bounded set of authorized memories
            Vault-->>Core: Confirmed memories and provenance
            Core->>Core: Builds authorized, bounded context
        end
        opt Selected memories are not empty
            Core->>Vault: Records a context disclosure receipt
        end
        Core->>LLM: Request and authorized context / HTTPS if remote
        Note over Core,LLM: Optional WireGuard carries this HTTPS without decrypting it
        LLM-->>Core: Response headers
        Core->>Vault: Records latency and local observations
        LLM-->>Core: Response body, optionally streamed
        Core-->>UI: Provider response
        UI-->>User: Displays the response
    end
```

The conversation is not sent to the OMNI collector. The **selected provider** necessarily receives the authorized text to perform its computation. Any retention depends on that provider's contract and configuration. Local mode keeps this computation on the device.

A memory extracted from a capture remains a **proposal** until confirmed. A receipt records an attempted disclosure by OMNI; it does not prove that a provider deleted its copies or used each memory correctly.

The gateway selects authorized, confirmed memories, up to 24 entries and 12,000 bytes. This selection does not yet perform semantic retrieval based on the question. Query-based lexical search is available through MCP. Observations do not automatically archive the conversation. Supported stream events contribute token counters when present; missing counters remain unknown. The native UI bridge returns a bounded complete body, while the external gateway preserves stream bytes.

Standalone native startup opens no HTTP listener or collector and uses its own OS application-data vault. `run.sh` explicitly chooses external development services through `OMNI_EXTERNAL_CORE=1`. Neither mobile source support nor this diagram implies a background capture service or mobile VPN. [Platform boundaries →](docs/PLATFORMS.md)

## 2. A landscape that evolves

**Target — a temporal knowledge graph and authority for each agent.** V1 already has sources, memories, states, histories, permissions, and receipts. Its search is lexical; the semantic relationships shown below and distinct cryptographic identities for each agent remain to be built.

```mermaid
flowchart TB
    Owner["You<br/>Confirm, correct, revoke"]
    Agents["External agents<br/>Distinct identities — target"]

    subgraph Authority["Local authority · authorization boundary"]
        Policy["Capability checks<br/>Agent · destination · action · duration · scope"]
        Proposals["Untrusted proposals<br/>Never an authorization"]
        Export["Context for one task<br/>Filter before reading and before sending"]
        Receipts["Disclosure receipts<br/>What · to whom · under which permission"]

        subgraph Memory["Encrypted local vault · target graph"]
            Sources["Sources and provenance"]
            Claims["Typed facts and relationships"]
            Time["Temporal validity<br/>Versions and contradictions"]
            Index["Derived indexes<br/>Lexical · vector · graph"]
            Sources --> Claims
            Claims <--> Time
            Claims --> Index
        end

        Policy -->|"Authorized read"| Index
        Index --> Export
        Export --> Receipts
        Policy -->|"Proposed write"| Proposals
        Proposals -->|"After confirmation"| Claims
    end

    Owner -->|"Sets the rules"| Policy
    Owner -->|"Resolves factual disputes"| Proposals
    Agents -->|"Present a capability"| Policy
    Export -->|"Authorized subset"| Agents
```

**Zero trust means checking every request.** An agent never receives direct SQL access to the vault. An instruction found in a document remains data: it cannot expand a permission. The target also separates the vault from network egress through OS mechanisms; this confinement is not an established property of the current Rust process.

The graph preserves disagreements and dates. Indexes accelerate retrieval; they do not become the source of truth. A correction must invalidate the affected derived views. A Nebula visualization does not prove that a relationship was inferred correctly.

## 3. The ecosystem: two destinations, two contracts

**Analytics target — C4 container model.** Here, a “container” means an executable unit or a data store in the C4 model; it does not mean everything must run in Docker. This view retains the v1 Rust client and shows the backend's evolution toward SingleStore. **Today, the Fastify collector uses Redis in production and SQLite in development.** Future isolation of local modules into separate processes is detailed in the [architecture guide](ARCHITECTURE.md).

```mermaid
C4Container
    title OMNI-OS — local client and target SingleStore analytics

    Person(user, "User", "Chooses memories and their recipients")

    System_Boundary(device, "Personal device") {
        Container(core, "OMNI native app", "Tauri + Rust + OpenDP", "UI IPC, gateway, policy, and local DP")
        ContainerDb(localdb, "Personal vault", "SQLCipher", "Memory, permissions, receipts, and DP budget")
    }

    System_Ext(provider, "Selected model", "Local model or remote HTTPS provider")

    System_Boundary(collective, "OMNI Collective") {
        Container(api, "Analytics API", "Fastify / HTTPS + WSS", "Admission, aggregation, and publication")
        ContainerDb(analytics, "Global analytics", "SingleStore — target", "Noisy aggregates and deduplication ledger")
    }

    Rel(user, core, "Interacts through Nebula")
    Rel(core, localdb, "Reads / writes")
    Rel(core, provider, "Authorized context")
    BiRel(core, api, "Noisy report / acknowledgment")
    BiRel(api, analytics, "Aggregates and queries")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
    UpdateRelStyle(user, core, $offsetY="-30")
    UpdateRelStyle(core, localdb, $offsetX="-35", $offsetY="-30")
    UpdateRelStyle(api, analytics, $offsetX="-45", $offsetY="-35")
```

The LLM SaaS provides computation. The OMNI SaaS maintains durable statistical state. **Neither is assigned the role of authoritative personal memory by this architecture.** Calling a model as a stateless engine does not guarantee that its provider keeps no logs.

This view focuses on processing and storage in a deployment with analytics configured. The default standalone native app supplies no collector and cannot activate or prepare analytics. In the external development deployment, Nebula queries the configured analytics API and receives publications over WebSocket: only trends that meet the required publication threshold, accompanied by their uncertainty. Separate native modules here do not imply OS process isolation.

SingleStore would receive only reports that have already been randomized and minimal technical ingestion data. A transaction must couple deduplication with aggregate updates. If a durable queue and pipeline are added, their guarantees alone will not prevent identical HTTP requests from being counted twice at different journal positions. In the target local isolation model, the network sender receives only the already randomized report; it has no direct access to the personal database.

Mermaid's C4 syntax is [experimental](https://mermaid.js.org/syntax/c4). The block above is tested with Mermaid CLI 11.17.0; GitHub's embedded version may differ. The other views use standard sequence diagrams and flowcharts.

## 4. A statistical report should spend its budget only once

**Implemented — explicitly prepared weekly reports and voluntary export, when a collector is configured.** Analytics is disabled by default outside simulation. The standalone native configuration has no collector and rejects activation, preparation and sending before budget consumption. The server accepts only the specified closed numeric schema; no unrestricted field can hold a conversation.

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Core as Local OMNI / OpenDP
    participant DB as SQLCipher vault
    participant API as OMNI collector
    participant Store as Redis / development SQLite

    User->>Core: Enables analytics and prepares a report
    Core->>DB: Checks the week and remaining budget
    alt Report already prepared
        DB-->>Core: Same identifier and same noisy values
    else New release authorized
        DB-->>Core: Bounded local histograms
        Core->>Core: Applies three Laplace mechanisms
        Core->>DB: Transaction: immutable report and budget expenditure
        DB-->>Core: Durable commit
    end
    Core-->>User: Numeric report preview
    User->>Core: Authorizes sending
    Core->>API: POST /api/v1/analytics
    Note over Core,API: Remote HTTPS / loopback HTTP in the local lab
    API->>API: Validates schema, size, and parameters
    API->>Store: Atomically: identifier + digest + aggregates
    Store-->>API: New report or identical retry
    API-->>Core: Acknowledgment
    Note over Core,API: If network delivery is uncertain, resend exactly the same report
    Note over API,Store: Same identifier with different content: reject
```

Three normalized histograms, each with eight bins: topics, latency, and tokens. Each has L1 sensitivity bounded by 2 and a budget of ε = 1/3. The report therefore composes to **ε = 1**. V1 limits the pilot to **four reports per installation**, giving ε ≤ 4 while that ledger is preserved. The Laplace scale is slightly greater than 6 to account for the numerical implementation.

This mechanism bounds the change in the output distribution when one installation's data for a week is replaced. It hides neither IP addresses nor participation. The production threshold counts **reports**, not distinct people. Reinstallation, divergent copies of the vault, and multiple devices must not be presented as an already solved global privacy budget per person. [Guarantees and calculations →](docs/PRIVACY.md)

## 5. The tunnel protects transport

**Implemented — authenticated knocking and WireGuard identity rotation.** Knocking grants short-lived admission, authenticated with an HMAC, nonce, and timestamp. Opening a few ports in a particular order does not constitute authentication.

```mermaid
sequenceDiagram
    autonumber
    participant Client as WireGuard client
    participant Admission as Hub admission service
    participant Hub as Hub WireGuard peers
    participant Relay as Constrained SOCKS relay
    participant SaaS as Authorized HTTPS provider

    Note over Client,Hub: Initial identity and public key are enrolled in advance
    Client->>Admission: Authenticated Open: identifier, epoch, nonce, and timestamp
    Admission->>Admission: Verifies the secret and persistent replay protection
    Admission->>Hub: Opens UDP access for the source IP for 120 seconds
    Admission-->>Client: Authenticated admission acknowledgment
    Client->>Hub: WireGuard / Noise handshake
    loop While connected
        Client->>Admission: Renews admission every 60 seconds
        Client->>Hub: Encrypted IP packets
        Hub->>Relay: Forwarding to the authorized relay
        Relay->>SaaS: Carries the gateway's TLS stream
        SaaS-->>Client: TLS response through the same path
    end
    Note over Client,SaaS: The hub sees transport metadata, not the TLS-protected text
    Note over Client,Hub: Additional static identity rotation every 1,800 seconds
    Client->>Client: Generates a new random private key
    Client->>Admission: Prepares the new peer
    Admission->>Hub: Installs the candidate peer
    Admission-->>Client: Authenticated preparation acknowledgment
    Note over Admission,Hub: An unconfirmed candidate expires after 60 seconds
    Client->>Hub: Verifies the new peer's handshake
    Client->>Admission: Confirms the switch
    Admission->>Hub: Checks the candidate's recent handshake
    Admission->>Admission: Persists the commit
    Admission-->>Client: Acknowledges the commit
    Admission->>Hub: Removes the old peer after the 30-second overlap
```

**WireGuard uses Noise; IKE belongs to IPsec.** Identity key rotation every thirty minutes is additional to WireGuard's automatic session key renewal. It is not an IKE mode. Changing the internal address during the switch can interrupt a TCP connection; application-level recovery remains necessary.

BoringTun ↔ Linux WireGuard interoperability, admission, rotation, and rejection of the old key have been tested in the scenarios recorded in [validation evidence](docs/VALIDATION.md). The local simulation installs no privileged routes. The macOS `utun` supervisor requires a separate privileged launch; its complete path needs its own target-machine validation. The native mobile app installs no system VPN extension. [Deployment, servers, and secrets →](docs/VPN.md)

## Read the arrows without inventing guarantees

| Arrow                 | What crosses it                                     | What it does not prove                                  |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Memory → gateway      | Context selected under a permission                 | Infallible understanding of a person                    |
| Gateway → remote LLM  | The prompt and authorized context, protected by TLS | No retention by the provider                            |
| Exporter → collector  | An already randomized numeric report                | Network anonymity or a unique human participant         |
| Collector → interface | Publishable aggregates with their limitations       | A clinical measurement, universal opinion, or certainty |
| VPN client → hub      | Encrypted transport and a peer identity             | Universal semantic interception of applications         |

[Back to README](README.md) · [Architecture](ARCHITECTURE.md) · [Roadmap](ROADMAP.md)
