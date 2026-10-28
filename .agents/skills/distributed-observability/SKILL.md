---
name: distributed-observability
description: >-
  Enforces structured logging, correlation IDs, OpenTelemetry metrics, and audit trail telemetry.
  Use when writing API endpoints, asynchronous queue workers, background jobs, or telemetry tickers.
---

# Distributed Observability & Structured Logging

Complex enterprise software fails silently at scale without robust observability. This skill mandates structured telemetry, correlation tracking, and traceable error logging across all services.

## Core Rules

1. **Ban Generic `console.log()` in Production Services**:
   - Use structured JSON logging with level metadata (`debug`, `info`, `warn`, `error`).
   - Every log entry must include a timestamp, component name, and workspace context.
2. **Correlation ID Propagation**:
   - Every incoming HTTP request or PBX webhook must extract or generate an `X-Correlation-ID` (or `trace_id`).
   - Propagate this correlation ID through asynchronous background jobs (`jobs` table) and downstream API calls (Deepgram, Gemini).
3. **Structured Event Payloads**:
   - Log events as key-value objects rather than concatenated strings:
     ```ts
     logger.info('Call ingested', {
       callId: 1042,
       durationSec: 145,
       source: 'tata_smartflo',
       workspace: 'preorder_desk',
     });
     ```
4. **Audit Trail Compliance**:
   - Every compliance review, scorecard override, or regulatory recalculation must append an entry to the `audit_logs` table containing:
     - `user_id` / `operator_email`
     - `entity_type` and `entity_id`
     - `action` (`OVERRIDE_Q1`, `FINALIZED_SCORECARD`, `PURGE_WORKSPACE`)
     - `before_state` and `after_state` (JSON diff)
     - `ip_address` and `timestamp`
