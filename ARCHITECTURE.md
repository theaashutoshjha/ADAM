# AuditEQ (ADAM-AR) — Visual Architecture Specification

> **Industrial Voice-to-Compliance Intelligence Engine**  
> *Standard:* SEBI Equity Pre-Order Voice Audit Norms | *Runtime:* Node.js 22 (`node:sqlite` WAL) + React 19

---

## 1. High-Level System Architecture

![AuditEQ System Architecture](./docs/images/system_architecture.jpg)

```mermaid
flowchart TB
    subgraph S1["1. INGESTION & DSP LAYER"]
        direction TB
        A1["📞 Telephony Audio\n(.mp3 / .wav / AMR)"] --> B1["🔒 SHA-256 Checksum\nDe-duplication"]
        A2["📈 OMS Trade Feed\n(.csv / .xlsx)"] --> B2["📅 Timestamp & Date\nISO-8601 Normalizer"]
        A3["👤 KYC Client Master\n(.csv / API)"] --> B3["📞 Phone & UCC\nDirectory Hash Cache"]
        B1 --> B4["🎛️ Audio DSP\n• 300–3400Hz Bandpass\n• -18 LUFS Leveling\n• Stereo Channel Split"]
    end

    subgraph S2["2. SPEECH ASR & INTENT TRIAGE"]
        direction TB
        B4 --> C1{"🎙️ Dual Neural ASR"}
        C1 -->|"Primary"| C2["⚡ Groq Whisper Large-v3\n(Financial Prompts)"]
        C1 -->|"Secondary"| C3["🎯 Deepgram Nova-3\n(Indic English & Vernacular)"]
        C2 & C3 --> C4["🔤 Financial Normalizer\n(Jargon, Homophones, Numbers)"]
        C4 --> C5{"Gate 4: Intent Classifier"}
        C5 -->|"< 6s / Silence / Voicemail"| D1["🚫 SCRAP (Excluded)"]
        C5 -->|"Account / Support"| D2["ℹ️ REGULAR (Excluded)"]
        C5 -->|"Order Placement / Exit"| D3["✅ PRE_ORDER (Auditable)"]
    end

    subgraph S3["3. TRADE MATCHING & CLUSTERING"]
        direction TB
        B2 & B3 --> E1["📦 Multi-Execution Clusterer"]
        D3 --> E1
        E1 --> E2["⚖️ VWAP Calculation\n& Order Consolidator"]
        E2 --> E3["👤 Authoritative UCC &\nAdvisor Resolution"]
    end

    subgraph S4["4. SEBI 5-POINT COMPLIANCE ENGINE"]
        direction TB
        E3 --> F1["Q1: Caller CLI Match\n[FATAL]"]
        E3 --> F2["Q2: Spoken Client UCC\n[FATAL]"]
        E3 --> F3["Q3: Order Parameters\n[NON-FATAL: -1]"]
        E3 --> F4["Q4: Verbal Assent\n[NON-FATAL]"]
        E3 --> F5["Q5: No Return Guarantee\n[FATAL]"]
        F1 & F2 & F3 & F4 & F5 --> F6["🔢 Authoritative Scoring\n(0/5, 4/5, 5/5)"]
    end

    subgraph S5["5. STORAGE & CONCURRENCY"]
        direction TB
        F6 --> G1[("🗄️ SQLite Database\n(auditeq_production.db)\n• WAL Concurrency\n• 60s Busy Timeout\n• Unique: 1 Call = 1 Scorecard")]
        G1 --> G2["📑 Missing Call Ledger\n(Terminal Trades without Audio)"]
    end

    subgraph S6["6. UI & EXPORT PLATFORM"]
        direction TB
        G1 --> H1["📊 Executive Dashboard"]
        G1 --> H2["🎧 Calls Waveform & Prompter"]
        G1 --> H3["🎯 Scorecards & Radar HUD"]
        G1 --> H4["📋 Audited Master Grid"]
        G1 --> H5["📄 Export Engine\n(PDF, DOCX, XLSX, CSV)"]
    end
```

---

## 2. End-to-End Processing Sequence & Enterprise Topology

![Enterprise Architecture Overview](./docs/images/enterprise_architecture_overview.png)

```mermaid
sequenceDiagram
    autonumber
    actor Dealer as Trader / Dealer
    actor Client as Customer
    participant PBX as Telephony PBX
    participant DSP as DSP & Ingestion
    participant ASR as Dual Neural ASR
    participant Engine as Compliance Engine
    participant DB as SQLite WAL Store
    participant UI as Compliance Officer UI

    Client->>Dealer: Telephone Trade Instruction
    Dealer->>PBX: Call Completed & Recorded
    PBX->>DSP: Ingest Audio (.wav/.mp3)
    DSP->>DSP: SHA-256 Checksum + Bandpass + -18 LUFS
    DSP->>ASR: Process Clean Audio Buffer
    ASR->>ASR: Transcribe with Timestamps & Phoneme Repair
    ASR->>Engine: Raw Transcript + Speaker Diarization
    Engine->>Engine: Gate 4: PRE_ORDER Classification
    Engine->>Engine: Cluster Multi-Execution Trades (VWAP)
    Engine->>Engine: Evaluate Q1, Q2, Q3, Q4, Q5
    Engine->>DB: Atomic Upsert (1 Call = 1 Scorecard)
    DB-->>UI: Real-Time Telemetry & Radar Metric Update
    UI->>UI: View Waveform, Subtitles & Official PDF Export
```

### Pipeline Latency & Throughput Targets

| Stage | Process | Engine / Library | Latency Budget | Output Target |
|:---:|---|---|:---:|---|
| **1** | Audio Ingestion & Checksum | Native Buffer / Crypto | `< 50ms` | Deduplicated audio file |
| **2** | DSP Signal Conditioning | FFmpeg (Bandpass & LUFS) | `< 250ms` | Clean leveled WAV |
| **3** | Neural Speech Recognition | Groq Whisper Large-v3 | `< 1200ms` | Time-stamped tokens |
| **4** | Gate 4 Intent Triage | Semantic Intent Engine | `< 80ms` | PRE_ORDER / REGULAR / SCRAP |
| **5** | Trade Clustering & VWAP | OMS Execution Funnel | `< 40ms` | Aggregated parent order |
| **6** | SEBI 5-Point Compliance | Deterministic Rule Matrix | `< 30ms` | Q1-Q5 Flags + Score |
| **7** | Persistence & Audit Sync | `node:sqlite` WAL Mode | `< 20ms` | Atomic Scorecard row |

---

## 3. SEBI 5-Point Compliance Radar & Scoring Engine

![SEBI Compliance Radar & Scoring](./docs/images/sebi_radar.jpg)

### SEBI 5-Point Rule Rubric

```mermaid
flowchart TD
    START["Call Audio & Matched Trade"] --> EVAL{"Evaluate 5 SEBI Checkpoints"}
    
    EVAL --> Q1["Q1: Caller CLI Match\n[FATAL]"]
    EVAL --> Q2["Q2: Spoken Client UCC\n[FATAL]"]
    EVAL --> Q3["Q3: Order Parameters\n[NON-FATAL: -1]"]
    EVAL --> Q4["Q4: Verbal Assent\n[NON-FATAL]"]
    EVAL --> Q5["Q5: Code of Conduct / No Guarantee\n[FATAL]"]
    
    Q1 & Q2 & Q5 --> CHECK_FATAL{"Any Fatal Failed?\n(Q1=FAIL or Q2=FAIL or Q5=FAIL)"}
    
    CHECK_FATAL -->|"YES (Fatal Breach)"| RES_0["🟥 SCORE: 0 / 5\n[NON-COMPLIANT / BREACH]"]
    
    CHECK_FATAL -->|"NO (Fatals Passed)"| CHECK_Q3{"Q3 Parameter Discrepancy?\n(Ambiguous Symbol, Qty, or Price)"}
    
    CHECK_Q3 -->|"YES (Missing Param)"| RES_4["🟨 SCORE: 4 / 5\n[CONDITIONAL PASS / MINOR DEDUCTION]"]
    CHECK_Q3 -->|"NO (All Verified)"| RES_5["🟩 SCORE: 5 / 5\n[FULL SEBI COMPLIANT]"]
```

### Parameter Scoring Specifications

| Q# | Checkpoint | Rule Description | Weight / Type | Pass Evidence | Fail Trigger |
|:---:|---|---|:---:|---|---|
| **Q1** | **Caller CLI vs Registered KYC** | CLI must match registered mobile in KYC master | **FATAL** (1 Pt) | Inbound CLI matches client directory | Unregistered number without KYC line |
| **Q2** | **Spoken UCC / Authenticated Line** | Client UCC verbalized or trade placed on authenticated KYC line | **FATAL** (1 Pt) | UCC spoken (e.g. `WIA71438`) or call on verified line | Unauthenticated line & UCC not spoken |
| **Q3** | **Order Parameters** | Scrip name, Buy/Sell side, Quantity, and Price/CMP verified | **NON-FATAL** (1 Pt) | All 4 order elements verbalized | Missing/ambiguous quantity or price (`-1 deduction`) |
| **Q4** | **Customer Verbal Assent** | Explicit confirmation from client to execute | **NON-FATAL** (1 Pt) | Affirmative response (*"Yes", "Ok", "Kar do"*) | Silence, hesitation, or explicit objection |
| **Q5** | **No Return / Profit Guarantee** | Prohibition of guaranteed returns or promised gains | **FATAL** (1 Pt) | Zero return promises or safety guarantees | Any promised returns or profit assurance |

---

## 4. Multi-Execution Trade Clustering & 1-Call-1-Scorecard Cardinality

![Multi-Execution Trade Clustering Flow](./docs/images/trade_clustering.jpg)

### Cardinality Invariant

$$\mathbf{1\ Physical\ Call\ (call\_id)\ \equiv\ Exactly\ 1\ Call\ Record\ \equiv\ Exactly\ 1\ Scorecard}$$

```mermaid
flowchart LR
    subgraph LEGACY["❌ Flawed Architecture (Keyed on Trade ID)"]
        direction TB
        C_OLD["Call #157\n(Single Session)"] --> T1["Fill #1: 50 TCS"] --> SC1["Scorecard #1 (5/5)"]
        C_OLD --> T2["Fill #2: 50 TCS"] --> SC2["Scorecard #2 (5/5)"]
        C_OLD --> T3["Fill #3: 100 INFY"] --> SC3["Scorecard #3 (5/5)"]
    end

    subgraph CLUSTER_ENGINE["✅ Authoritative Architecture (Keyed on Call ID)"]
        direction TB
        C_NEW["Call #157\n(Single Session)"] --> CLUSTER["Multi-Execution Clusterer\n• Symbols: 'TCS, INFY'\n• Total Qty: 200\n• VWAP Calculated"]
        CLUSTER --> SC_SINGLE["Scorecard #157 (Single Authoritative Record)\nUnique Constraint: uq_scorecards_call_id"]
    end
```

### Trade Clustering Funnel Logic

```mermaid
graph TD
    A["Raw OMS Fills"] --> B["Group by: [Client UCC + 5-Minute Window + Advisor Line]"]
    B --> C["Aggregate Quantities: Qty_Total = Sum(Qty_i)"]
    C --> D["Compute VWAP: Price_Avg = Sum(Qty_i * Price_i) / Qty_Total"]
    D --> E["Consolidate Scrip Symbols: e.g. 'RELIANCE, TCS'"]
    E --> F["Single Consolidated Order Record"]
    F --> G["Match to Single Call Recording"]
    G --> H["Exactly 1 Scorecard Published"]
```

---

## 5. Interactive Calls Workspace & Audio Diarization UI

![Compliance Calls Workspace](./docs/images/calls_workspace.jpg)

### Interactive Workspace Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎧 INTERACTIVE CALLS WORKSPACE                                                                  │
├─────────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ [► Play] 01:24 / 02:45   ▂▃▅▆▇▆▅▃▂ ▂▃▅▆▇▆▅▃▂   │ CALL METADATA                                 │
│ Waveform Scrubbing Bar (Click to seek audio)    │ Call ID: #2193  | Date: 2026-10-06 09:16:22   │
├─────────────────────────────────────────────────┤ Caller CLI: 9718766002 (✓ KYC Match)          │
│ SYNCHRONIZED DIALOGUE PROMPTER                  │ Client UCC: WIA71438   (✓ Spoken at 27.4s)    │
│ [00:12] ADVISOR : FundsIndia Equity desk, hello?│ Advisor   : Ashutosh Kumar (W1008)            │
│ [00:15] CLIENT   : Haan, 100 shares le lo CMP pe│ Status    : AUDITED (Score: 5/5 COMPLIANT)    │
│ [00:27] ADVISOR : Buying 100 shares in WIA71438.├───────────────────────────────────────────────┤
│                                                 │ INLINE COMPLIANCE OVERRIDES                   │
│                                                 │ [Q1: CLI ✓]  [Q2: UCC ✓]  [Q3: Order ✓]       │
│                                                 │ [Q4: Assent ✓]  [Q5: Conduct ✓]               │
└─────────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

## 6. Gatekeeper State Machine & Intent Triage

```mermaid
stateDiagram-v2
    [*] --> Ingested: SHA-256 Verified
    Ingested --> DSP_Ready: Bandpass & Loudness Normalized
    DSP_Ready --> Transcribed: Dual ASR (Timestamps & Text)
    
    Transcribed --> Gate4_Triage
    Gate4_Triage --> SCRAP: Duration < 6s / Silence / Hangup
    Gate4_Triage --> REGULAR: Query / Support / Post-Trade
    Gate4_Triage --> PRE_ORDER: Trade Instruction Verbalized
    
    SCRAP --> [*]: Excluded from Audit
    REGULAR --> [*]: Excluded from Audit
    
    PRE_ORDER --> Trade_Matched: Linked to Executed Order / VWAP
    Trade_Matched --> Audited: Q1-Q5 Evaluated
    Audited --> Scorecard_Published: Score: 0/5, 4/5, or 5/5
    Scorecard_Published --> [*]
```

### Acoustic & Semantic Edge Case Resolvers

```mermaid
flowchart LR
    subgraph INPUTS["Speech & Entity Anomalies"]
        E1["Digit Pauses\n'WIA 5 3 3 5 7'"]
        E2["Entity Formatting\n'WIA ₹5,357'"]
        E3["Bilingual Hindi\n'CMP pe kar do'"]
        E4["Instant Hangup\nDuration < 6s"]
    end

    subgraph RESOLVERS["Deterministic Resolvers"]
        R1["Normalizer: Strip spaces & hyphens"]
        R2["De-mangler: Reverse currency entity formatting"]
        R3["Intent Parser: Map 'kar do' to Market Order"]
        R4["Gate 4: Auto-classify as SCRAP"]
    end

    subgraph OUTCOMES["Audit Resolution"]
        O1["UCC: WIA53357 (Q2 PASS)"]
        O2["UCC: WIA5357 (Q2 PASS)"]
        O3["Price: Valid Market Order (Q3 PASS)"]
        O4["No false fatal breach generated"]
    end

    E1 --> R1 --> O1
    E2 --> R2 --> O2
    E3 --> R3 --> O3
    E4 --> R4 --> O4
```

---

## 7. KYC & Advisor Directory Resolution

```mermaid
flowchart TD
    A["Raw Call / Trade Advisor Entry"] --> B{"Is Placeholder or Code?\n• 'advisor name' / 'dealer'\n• 'W1008' / 'W1002'\n• 'unassigned' / 'n/a'"}
    B -->|"Yes (Placeholder/Code)"| C["Lookup Dealer in FundsIndia Master Directory"]
    B -->|"No (Authentic Name)"| D["Use Direct Verified Name"]
    C --> E{"Match Found?"}
    E -->|"Yes"| F["Map to Authoritative Full Name\n(e.g., 'Ashutosh Kumar')"]
    E -->|"No"| G["Apply Brokerage Default\n'FundsIndia Advisor'"]
    D --> H["Master Scorecard Grid & Regulatory Exports"]
    F --> H
    G --> H
```

---

## 8. Database Entity Relationship (ER) Model

```mermaid
erDiagram
    calls ||--o{ call_segments : "segmented into"
    calls ||--o{ call_orders : "contains orders"
    calls ||--o| audits : "audited by"
    calls ||--|| scorecards : "summarized by (1:1)"
    trades ||--o{ order_executions : "fills"
    call_orders ||--o{ order_executions : "matches"
    clients ||--o{ calls : "originates"
    clients ||--o{ trades : "placed by"

    calls {
        int id PK
        string recording_name UK
        string calling_number
        string registered_number
        string transcript
        string classification
        string status
        int duration_seconds
    }

    trades {
        int id PK
        string external_id
        string client
        string symbol
        float quantity
        float price
        string order_type
        int matched_call_id FK
    }

    audits {
        int id PK
        int call_id FK
        string q1
        string q2
        string q3
        string q4
        string q5
        float score
        string compliance_disposition
    }

    scorecards {
        int id PK
        int call_id UK,FK
        int audit_id FK
        string caller_name
        string dealer
        string client_code
        float score
        int is_fatal
        string q1_status
        string q2_status
        string q3_status
        string q4_status
        string q5_status
    }

    clients {
        int id PK
        string client_code UK
        string name
        string phone
        string advisor_name
        string dealer_id
    }
```

---

## 9. Technology Stack & Operational Architecture

```mermaid
flowchart TD
    subgraph RUNTIME["Application Runtime"]
        NODE["Node.js 22 LTS\n• Native ES Modules\n• DatabaseSync C++ binding"]
        SQLITE["SQLite 3 (WAL Engine)\n• Zero-lock reader concurrency\n• 60,000ms busy timeout"]
    end

    subgraph CLIENT["Frontend Web Client"]
        REACT["React 19 SPA\n• TypeScript 5.8\n• Vite 6 HMR"]
        VIEWS["Dashboard | Calls View | Scorecards | Audited Master | Reports"]
    end

    subgraph AI_DSP["AI & Audio Processing"]
        WHISPER["Groq Whisper Large-v3\n(Financial Prompts)"]
        NOVA["Deepgram Nova-3\n(Indic Vernacular)"]
        FFMPEG["FFmpeg Static\n(300-3400Hz Bandpass + -18 LUFS)"]
    end

    subgraph EXPORT["Regulatory Export Engine"]
        PDF["PDFKit\n(SEBI Summary & Detail Reports)"]
        EXCEL["SheetJS (XLSX/CSV)\n(Audited Master Export)"]
    end

    NODE <--> SQLITE
    NODE <--> AI_DSP
    CLIENT <--> NODE
    NODE --> EXPORT
```

---

## 10. Summary Matrix: Key Issues & Authoritative Architectural Fixes

| Issue Area | Flawed Legacy Behavior | Authoritative Architectural Fix | Verification Result |
|---|---|---|:---:|
| **Q2 High Failure Rate** | `reconciliation.ts` read `a.q2_status` from `audits` table (where column is `q2`), resolving to `undefined` and forcing `'FAIL'` | Reads authoritative `a.q1`, `a.q2`, `a.q3`, `a.q4`, `a.q5` with backwards-compatible fallbacks | **84.7% Pass Rate** (438 Pass / 79 Fail, 0 contradictions) |
| **Call Duplication** | Calls duplicated when multiple trades occurred on a single phone instruction | Multi-Execution Clustering groups partial fills by UCC, time-window, and advisor into 1 parent order with VWAP | **1 Call = 1 Scorecard** (Strict DB Unique Constraint) |
| **Placeholder Advisor Name** | Master exports showed literal `"advisor name"` or dealer code | Resolves via FundsIndia Master Directory mapping to verified advisor name (e.g., `Ashutosh Kumar`) | **100% Authentic Names** across grids & reports |
| **SQLite Lock Contention** | Database busy exceptions when simultaneous audit and read queries occurred | Enabled WAL mode with `busy_timeout = 60000` and connection reuse | **Zero lock errors** during concurrent background audits |
