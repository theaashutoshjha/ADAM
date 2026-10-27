// =============================================================
// AuditEQ — Centralized High-Concurrency SQLite Database Factory
// Enforces WAL mode, 60s busy_timeout, memory caching, and integrity pragmas.
// Prevents SQLITE_BUSY: database is locked errors under concurrent load.
// =============================================================

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export const DEFAULT_DB_PATH = path.join(process.cwd(), '.data', 'auditeq_production.db');

export function openDatabase(dbPath: string = DEFAULT_DB_PATH): DatabaseSync {
  const db = new DatabaseSync(dbPath);

  // Configure high-concurrency PRAGMAs
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 60000;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
  `);

  return db;
}

let cachedConnection: DatabaseSync | null = null;

export function getDatabaseConnection(dbPath: string = DEFAULT_DB_PATH): DatabaseSync {
  if (!cachedConnection) {
    cachedConnection = openDatabase(dbPath);
  }
  return cachedConnection;
}
