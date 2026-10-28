---
name: security-review
description: >-
  Audits diffs and architecture for security vulnerabilities, OWASP Top 10 risks, SSRF, injection, and authorization flaws.
  Use when modifying network handlers, authentication/authorization logic, file upload pipelines, or database queries.
---

# Security & Static Hardening Protocol

This skill acts as a security gatekeeper. Autonomous code generation must be audited against common attack vectors, broken object level authorization (BOLA/IDOR), server-side request forgery (SSRF), and injection flaws before code is finalized.

## OWASP Top 10 & Enterprise Checks

### 1. Server-Side Request Forgery (SSRF)
- Any function fetching external URLs (telephony audio, webhooks, PBX endpoints) must pass through a strict SSRF validator.
- Reject plain `http:` connections in production (enforce HTTPS).
- Reject private IPs: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`.
- Reject AWS/GCP/Azure cloud metadata endpoints: `169.254.169.254`, `fd00::/8`.
- Enforce strict hostname allowlists (e.g. `*.tatateleservices.com`, `api.deepgram.com`).

### 2. SQL & Command Injection
- Never construct SQL queries with string concatenation or template literals (`SELECT ... WHERE id = ${id}`).
- Always use parameterized queries with SQLite / Postgres (`db.prepare('... WHERE id = ?').get(id)`).
- Never pass user-controlled input to `exec()`, `execSync()`, or child process shells without strict sanitization and argument arrays (`execFile` / `spawn`).

### 3. Broken Object-Level Authorization (BOLA / IDOR)
- Never query records by raw ID alone (`SELECT * FROM scorecards WHERE id = ?`).
- Enforce multi-tenant workspace isolation: always bind queries to the authenticated user's workspace:
  ```sql
  SELECT * FROM scorecards WHERE id = ? AND workspace_id = ?
  ```

### 4. CSV & Excel Formula Injection (CWE-1236)
- Sanitize any string exported to CSV or Excel.
- If a cell begins with `=`, `+`, `-`, or `@`, prepend a single quote (`'`) to neutralize spreadsheet command execution.

### 5. Sensitive Data Exposure & Timing Attacks
- Store passwords exclusively using salted Scrypt / Argon2 / PBKDF2 with high work factors.
- Use `crypto.timingSafeEqual()` for hash and token comparisons to prevent timing side-channel attacks.
- Never log raw authorization headers, API keys, passwords, or KYC documents in plain text.
