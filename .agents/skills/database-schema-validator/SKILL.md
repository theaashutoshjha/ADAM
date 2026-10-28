---
name: database-schema-validator
description: >-
  Enforces safe database evolution patterns, migration safety, foreign key relationships, and query indexing.
  Use when creating or altering database tables, writing schema migrations, adding indexes, or modifying queries.
---

# Database Schema & Migration Validator

This skill ensures database reliability, data integrity, and safe schema evolution. Destructive migrations, missing indexes, and unconstrained foreign keys degrade enterprise databases under production loads.

## Core Rules for Database Evolution

### 1. Backward-Compatible Migrations (Expand and Contract Pattern)
- **Never drop or rename a column in a single step** if live services depend on it.
- **Step 1 (Expand)**: Add the new nullable column alongside the old column. Deploy code that writes to both columns and reads from the new column.
- **Step 2 (Backfill)**: Run an asynchronous background migration to backfill historical data.
- **Step 3 (Contract)**: Once all clients use the new column, mark the old column deprecated and drop it in a subsequent release.

### 2. Foreign Key & Constraint Integrity
- Enforce `PRAGMA foreign_keys = ON;` in SQLite connections.
- Always declare explicit `ON DELETE CASCADE` or `ON DELETE RESTRICT` constraints to prevent orphaned children.
- Never write ad-hoc schema creations without `IF NOT EXISTS` or versioned migration tracking.

### 3. Safe Indexing & Performance
- Index all foreign keys and columns frequently used in `WHERE`, `JOIN`, `ORDER BY`, or `GROUP BY` clauses.
- In pre-order compliance queries, ensure compound indexes exist for:
  - `(phone_number, call_date, call_time)`
  - `(client_code, trade_match_status)`
  - `(workspace_id, status)`
- Avoid full-table scans (`SCAN TABLE`) in query plans; verify with `EXPLAIN QUERY PLAN`.

### 4. Concurrency & WAL Configuration
- Ensure SQLite operates in Write-Ahead Logging (`PRAGMA journal_mode = WAL;`).
- Configure a generous busy timeout (`PRAGMA busy_timeout = 60000;`) to prevent `SQLITE_BUSY: database is locked` errors during parallel worker pipelines.
