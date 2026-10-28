---
name: contract-mock-generator
description: >-
  Inspects API and protobuf specifications to generate typed mock servers, fixture factories, and synthetic datasets.
  Use when developing frontend components in isolation, writing end-to-end integration tests, or simulating external telephony/ASR providers.
---

# Contract Mock Generator & Subsystem Decoupling

This skill enables decoupled parallel development. By generating typed mock servers and deterministic fixture factories from API schemas, frontend interfaces can be verified without live external backend dependencies.

## Core Capabilities

### 1. Mock Service Worker (MSW) & Local Handlers
- Generate typed HTTP and WebSocket mock interceptors matching API contracts.
- Simulate network latency, 500 server errors, 401 unauthenticated drops, and 429 rate limits to verify frontend resilience and Error Boundaries.

### 2. Deterministic Fixture Factories
- Generate synthetic data matching production schemas with realistic Indian trading jargon:
  - Valid UCCs: `WIA12345`, `PWD00930`, `FIA45678`
  - Indian phone numbers: `+91-98XXXXXXXX`, `9876543210`
  - NSE/BSE Symbols: `RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `TATAMOTORS`
  - Indian trading audio phrases: *"Sir 100 shares market price pe buy kar do"*, *"CMP pe order execute ho gaya"*

### 3. Subagent Parallelism
- When building full-stack features:
  - Subagent A generates the mock contract and implements the frontend views against mock handlers.
  - Subagent B builds the real backend service and unit tests.
  - Both integrate seamlessly against the shared contract.
