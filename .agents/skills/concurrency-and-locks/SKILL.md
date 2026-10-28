---
name: concurrency-and-locks
description: >-
  Audits and prevents race conditions, deadlock vectors, unhandled promise batches, and concurrency hazards.
  Use when designing background workers, queue managers, multi-threaded pipelines, or webhook deduplicators.
---

# Concurrency Guard & Race Condition Prevention

High-throughput systems (such as batch processing 1,000+ trade calls or concurrent webhook deliveries) frequently experience data races, deadlocks, and double-processing bugs. This skill guides the agent in enforcing concurrency controls.

## Concurrency Hazards & Mitigation Patterns

### 1. Webhook & Ingestion Idempotency
- Incoming telephony webhooks from Tata Smartflo or upload batches may deliver duplicate events.
- Enforce idempotency using natural deduplication keys (e.g. `canonical_call_id` or `SHA-256(audio_hash)`).
- Use `INSERT INTO calls (...) ON CONFLICT(canonical_call_id) DO UPDATE ...` or check existing records before creating duplicate jobs.

### 2. Optimistic & Pessimistic Record Locking
- When multiple workers claim jobs from the `jobs` table:
  - Use atomic state transitions:
    ```sql
    UPDATE jobs
    SET status = 'processing', locked_at = CURRENT_TIMESTAMP, worker_id = ?
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued' AND (available_at IS NULL OR available_at <= CURRENT_TIMESTAMP)
      LIMIT 1
    )
    RETURNING *;
    ```
  - For SQLite, maintain a strict 60s `busy_timeout` to allow readers and writers to interleave under WAL mode without throwing `SQLITE_BUSY`.

### 3. Worker Concurrency Throttling
- When invoking external speech APIs (Deepgram Nova-3, Google Gemini Flash), never use unbounded `Promise.all(1000Items.map(...))`.
- Limit concurrency using a semaphore, p-limit, or fixed worker pool (e.g. 4 to 8 workers maximum) to prevent socket exhaustion and rate-limiting (HTTP 429).
