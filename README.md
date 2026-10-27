# ADAM-AR / AuditEQ — Enterprise Pre-Order Voice Quality & Regulatory Intelligence System

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-emerald?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-cyan?style=for-the-badge&logo=react)](https://react.dev/)
[![SQLite WAL / PostgreSQL](https://img.shields.io/badge/Engine-High--Concurrency%20WAL-indigo?style=for-the-badge&logo=sqlite)](https://www.sqlite.org/)
[![SEBI Compliance](https://img.shields.io/badge/SEBI-Circular%20Compliance%20Verified-gold?style=for-the-badge)](https://www.sebi.gov.in/)

> **ADAM-AR** (*Automated Dealer Audio Monitoring & Audit Reconciliation*) is a carrier-grade, AI-powered regulatory intelligence platform designed for institutional brokerages and SEBI-regulated trading desks. It ingests thousands of telephony audio recordings and executed trades daily, performs dual-engine speech-to-text transcription, enforces a strict 5-parameter regulatory compliance audit, and generates dispute-ready audit scorecards in real time.

---

## 🌟 Key Platform Capabilities

### 1. Dual-Engine Neural Speech Transcription
- **Primary Engine**: Deepgram Nova-3 multilingual speech model optimized for Indian English, Hindi, Tamil, and Telugu trading jargon.
- **Secondary Engine**: Gemini 2.0 Flash / Groq Whisper Large-v3 with specialized domain vocabularies (NSE/BSE security symbols, CMP, UCC phonetic spellings).
- **Audio DSP Preprocessing**: High-pass filtering, dual-channel stereo split (advisor channel vs. customer channel), RMS volume normalization, and silence truncation.

### 2. 5-Point SEBI Regulatory Compliance Audit Matrix
Every trading call is evaluated against the 5 non-negotiable regulatory parameters:
1. **Q1 — Registered Calling Line Identification (CLI)** `[FATAL]`: Verifies that the inbound/outbound call originates from or connects to the client's official KYC registered mobile number.
2. **Q2 — Explicit Spoken Client Code / UCC** `[FATAL]`: Detects whether the unique client code (e.g., `WIA43400`, `PWA01472`) was explicitly articulated and verified before trade execution.
3. **Q3 — Order Parameter Verification** `[1 Point]`: Confirms trading symbol (e.g., `RELIANCE`, `TCS`), order side (`BUY`/`SELL`), exact share quantity, and execution price or Market/CMP instruction.
4. **Q4 — Client Verbal Assent & Order Confirmation** `[1 Point]`: Confirms unambiguous verbal confirmation from the authenticated client.
5. **Q5 — Guaranteed Return Prohibition** `[FATAL]`: Strict NLP scans guaranteeing no broker/advisor made assured, guaranteed, or fixed return promises in violation of SEBI regulations.

### 3. Master Client & Advisor Registry with Auto-Healing
- **Master Directory Synchronization**: Instant bi-directional mapping between Client Codes (UCC), KYC Registered Phone Numbers, and Primary Assigned Advisors.
- **Zero-Drop Phone Resolution**: Ensures that even if a raw trade row is ingested without an explicit phone number, the system automatically resolves and binds the client's registered mobile number from the master KYC registry.
- **Audit Deficiencies Highlight**: Differentiates authentic pre-order conversations from **Missing Pre-Order Calls** (where an order was executed without a prior voice recording).

### 4. Interactive Telemetry HUD & Cybernetic Topology
- **System Architecture Topology Map**: Live visualization of data ingestion nodes (Tata Smartflo PBX, Upload Workspace), Queue Workers, Dual ASR Engines, 5-Point Audit Pipeline, and Scorecard Dispatchers.
- **Dual-Channel Audio Waveform Visualizer**: Interactive audio player with scrubbable waveform, millisecond seeking, and synchronized word-level transcript highlighter.
- **SEBI Compliance Radar & Distribution Charts**: Dynamic visual telemetry showing compliance rates, fatal violation breakdowns, and advisor performance scorecards.

---

## 🏗️ System Architecture Overview

```
                               ┌────────────────────────────────┐
                               │   Tata Smartflo PBX / CDR /    │
                               │   Trade Report Excel Ingestion │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │    Audio DSP Preprocessor &    │
                               │  Master Directory Auto-Healing │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │   Dual-Engine Neural ASR       │
                               │ Deepgram Nova-3 + Gemini Flash │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                      ┌──────────────────────────────────────────────────┐
                      │    5-Point SEBI Regulatory Compliance Pipeline   │
                      │  Q1: CLI Match  |  Q2: Spoken UCC  |  Q3: Order  │
                      │  Q4: Assent     |  Q5: Guaranteed Return Check   │
                      └────────────────────────┬─────────────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │ SQLite WAL / PostgreSQL Engine │
                               │ Master Audits & Scorecards DB  │
                               └───────────────┬────────────────┘
                                               │
                 ┌─────────────────────────────┴─────────────────────────────┐
                 ▼                                                           ▼
┌─────────────────────────────────┐                         ┌─────────────────────────────────┐
│     Next-Gen React 19 Frontend  │                         │   Automated Email Dispatcher    │
│ HUD, Waveforms, Audited Master  │                         │  Advisor & Compliance Notices   │
└─────────────────────────────────┘                         └─────────────────────────────────┘
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: `v20.0.0` or higher (Node 22 / 24 recommended for native `node:sqlite`)
- **FFmpeg**: Required in system `PATH` for server-side audio normalization
- **Operating System**: Windows 10/11, macOS, or Ubuntu Linux 22.04+

### Installation & Execution

1. **Clone and Install Dependencies**:
   ```bash
   git clone <repo-url> adam
   cd adam
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root directory (see `.env.example`):
   ```env
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=super-secret-jwt-key-change-in-production
   
   # Dual ASR Engine Keys
   DEEPGRAM_API_KEY=your_deepgram_api_key
   GEMINI_API_KEY=your_gemini_api_key
   GROQ_API_KEY=your_groq_api_key
   
   # Email & Telephony Dispatch
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=compliance@yourbroker.com
   SMTP_PASS=app_specific_password
   ```

3. **Launch the Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:3000`.

4. **Production Build & Packaging**:
   ```bash
   npm run build
   npm run start
   ```

---

## 📂 Project Structure

```
d:/adam/
├── config/                     # Authoritative Client & Advisor Directories
│   ├── client_directory.csv    # Master Client KYC & Registered Phone Directory
│   ├── client_directory.json   # Machine-readable Client Directory
│   ├── advisors_directory.csv  # Official Broker/Advisor Routing Directory
│   └── advisors_directory.json # Advisor Routing Matrix with CC escalation emails
├── server/                     # Backend Pipeline & Telephony Services
│   ├── clientDirectoryService.ts # Client Directory Resolver & Auto-Healing
│   ├── authoritativeCallMetadata.ts # Telephony Indexed Metadata
│   ├── fundsindia-directory.ts # Advisor Email & Escalation Routing
│   ├── db.ts                   # Centralized SQLite WAL Database Factory
│   ├── normalizer.ts           # Speech & Text Entity Normalizer
│   ├── asr-engine.ts           # Deepgram Nova-3 & Gemini Dual ASR Engine
│   └── pipeline/               # 9-Stage Regulatory Processing Pipeline
│       ├── import.ts           # Stage 1: Ingestion & Validation
│       ├── audio-dsp.ts        # Stage 2: Audio Preprocessing
│       ├── transcription.ts    # Stage 3: ASR Speech Recognition
│       ├── classification.ts   # Stage 4: Pre-Order Intent Classifier
│       ├── tradeMatcher.ts     # Stage 5: Multi-Execution Trade Clustering
│       ├── uccResolver.ts      # Stage 6: Client UCC Extraction
│       ├── audit.ts            # Stage 7: Deterministic Entity Verification
│       ├── scoring.ts          # Stage 8: 5-Point SEBI Compliance Scoring
│       └── reconciliation.ts   # Stage 9: Scorecards & Missing Call Reconciliation
├── src/                        # Next-Gen React 19 Client
│   ├── App.tsx                 # Core Application Shell & Navigation
│   ├── components/             # Cybernetic UI Components
│   │   ├── DashboardView.tsx   # Compliance Telemetry Dashboard
│   │   ├── CallsView.tsx       # Live Telephony Table & Waveform Player
│   │   ├── ScorecardsView.tsx  # SEBI Regulatory Scorecard Grid
│   │   ├── AuditedMasterView.tsx # Master Editable Audit Grid
│   │   ├── PipelineTopologyGraph.tsx # Real-Time Cybernetic Topology HUD
│   │   ├── AudioWaveformVisualizer.tsx # Interactive Dual-Channel Waveform
│   │   └── ComplianceRadarChart.tsx # 5-Parameter Regulatory Radar Chart
│   └── lib/                    # API Client, Formatters & Utilities
├── tests/                      # Automated Verification & Regulatory Test Suites
├── server.ts                   # Unified Express API & Vite Dev Server
├── package.json                # Project Dependencies & Build Scripts
└── tsconfig.json               # TypeScript Configuration
```

---

## 🛡️ License & Regulatory Attributions
Designed and developed for Institutional Equities Broking & SEBI Audio Audit Mandates.
ADAM-AR Architecture © 2026. All rights reserved.
