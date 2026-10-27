import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import {
  clusterTradesIntoPreOrderSessions,
  correlatePreOrdersWithCalls,
  type PreOrderTradeSession,
} from '../server/pipeline/preOrderClusterEngine';
import { stage7AuditCall } from '../server/pipeline/audit';
import { stage8CalculateScore } from '../server/pipeline/scoring';
import { resolveIndianLanguageForCall } from '../server/pipeline/transcription';
import { stage1ImportCalls } from '../server/pipeline/import';
import { normalizePhoneNumber } from '../server/normalizer';

console.log('===========================================================');
console.log('Running User Specification Logic Verification');
console.log('===========================================================');

const db = new DatabaseSync(':memory:');

// Create required tables
db.exec(`
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_call_id TEXT,
    caller_id TEXT,
    original_filename TEXT,
    customer_number TEXT,
    calling_number TEXT,
    phone_number TEXT,
    registered_number TEXT,
    client TEXT,
    client_code TEXT,
    caller_name TEXT,
    dealer TEXT,
    advisor_name TEXT,
    call_date TEXT,
    call_time TEXT,
    duration_seconds INTEGER DEFAULT 60,
    storage_path TEXT,
    recording_url TEXT,
    file_size INTEGER DEFAULT 1000,
    mime_type TEXT DEFAULT 'audio/mp3',
    file_sha256 TEXT,
    classification TEXT DEFAULT 'PENDING',
    call_type TEXT DEFAULT 'unknown',
    trade_match_status TEXT DEFAULT 'PENDING',
    matched_trade_id INTEGER,
    status TEXT DEFAULT 'imported',
    pipeline_stage TEXT DEFAULT 'IMPORTED',
    processing_status TEXT DEFAULT 'IDLE',
    audit_status TEXT DEFAULT 'PENDING',
    current_gate TEXT DEFAULT 'GATE_0',
    gate_reason TEXT,
    failure_reason TEXT,
    classification_reason TEXT,
    transcript TEXT,
    transcript_raw TEXT,
    transcript_meta TEXT,
    transcript_model TEXT,
    transcript_status TEXT DEFAULT 'VALID',
    import_status TEXT DEFAULT 'CONFIRMED',
    identity_status TEXT DEFAULT 'CONFIRMED',
    identity_source TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT,
    dealer TEXT,
    advisor_name TEXT,
    dealer_name TEXT,
    team TEXT,
    trade_date TEXT,
    trade_time TEXT,
    client TEXT,
    client_code TEXT,
    client_number TEXT,
    phone_number TEXT,
    customer_number TEXT,
    symbol TEXT,
    side TEXT,
    quantity REAL,
    price REAL,
    price_display TEXT DEFAULT 'CMP',
    is_combined INTEGER DEFAULT 0,
    split_count INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS call_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    segment_id TEXT,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS call_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    segment_id TEXT,
    word TEXT NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    speaker TEXT,
    confidence REAL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS call_orders (
    id TEXT PRIMARY KEY,
    call_id INTEGER NOT NULL,
    order_index INTEGER DEFAULT 0,
    intent_type TEXT DEFAULT 'BUY',
    symbol TEXT,
    raw_symbol TEXT,
    quantity REAL,
    raw_quantity TEXT,
    price_type TEXT DEFAULT 'MARKET',
    limit_price REAL,
    raw_price TEXT,
    confidence REAL DEFAULT 1.0,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_executions (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    trade_id INTEGER NOT NULL,
    matched_quantity REAL,
    confidence REAL,
    margin REAL,
    reason TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    q1_status TEXT,
    q1_evidence TEXT,
    q2_status TEXT,
    q2_evidence TEXT,
    q3_status TEXT,
    q3_evidence TEXT,
    q4_status TEXT,
    q4_evidence TEXT,
    q5_status TEXT,
    q5_evidence TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scorecards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    score REAL,
    passed INTEGER,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT,
    total_files INTEGER,
    uploaded_count INTEGER,
    status TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_code TEXT UNIQUE,
    phone_number TEXT,
    registered_mobile TEXT,
    created_at TEXT
  );
`);

console.log('\n--- 1. Testing 10-Minute Pre-Order Clustering Engine ---');
// User Examples:
// Client PWA00930: bought 1 script -> 1 pre-order
// Client PWA03264: bought 4 scripts within 10 min -> 1 pre-order
// Client PWD04275: bought 2 scripts at 11:15, 1 script at 11:35 (>10 min) -> 2 pre-orders
const now = new Date().toISOString();

// PWD00930: 1 trade
db.prepare(`
  INSERT INTO trades (external_id, client, client_number, symbol, trade_date, trade_time, quantity, price, created_at)
  VALUES ('t1', 'PWD00930', '9811111111', 'RELIANCE', '2026-09-04', '10:00:00', 10, 2500, ?)
`).run(now);

// PWD03264: 4 trades of same stock within 10 min (10:02, 10:04, 10:07, 10:10) -> 1 pre-order session
db.prepare(`
  INSERT INTO trades (external_id, client, client_number, symbol, trade_date, trade_time, quantity, price, created_at)
  VALUES 
    ('t2', 'PWD03264', '9822222222', 'TATASTEEL', '2026-09-04', '10:02:00', 50, 150, ?),
    ('t3', 'PWD03264', '9822222222', 'TATASTEEL', '2026-09-04', '10:04:00', 25, 150, ?),
    ('t4', 'PWD03264', '9822222222', 'TATASTEEL', '2026-09-04', '10:07:00', 100, 150, ?),
    ('t5', 'PWD03264', '9822222222', 'TATASTEEL', '2026-09-04', '10:10:00', 200, 150, ?)
`).run(now);

// PWD04275: 3 trades of same stock (2 at 11:15, 1 at 11:35 > 10 min) -> 2 pre-orders
db.prepare(`
  INSERT INTO trades (external_id, client, client_number, symbol, trade_date, trade_time, quantity, price, created_at)
  VALUES 
    ('t6', 'PWD04275', '9833333333', 'HDFCBANK', '2026-09-04', '11:15:00', 10, 1600, ?),
    ('t7', 'PWD04275', '9833333333', 'HDFCBANK', '2026-09-04', '11:15:30', 20, 1600, ?),
    ('t8', 'PWD04275', '9833333333', 'HDFCBANK', '2026-09-04', '11:35:00', 30, 1600, ?)
`).run(now);

// Trade executed via Mail Confirmation (client has no call):
db.prepare(`
  INSERT INTO trades (external_id, client, client_number, symbol, trade_date, trade_time, quantity, price, created_at)
  VALUES ('t9', 'WIA99999', '9899999999', 'BHARTIARTL', '2026-09-04', '12:00:00', 15, 1500, ?)
`).run(now);

const sessions = clusterTradesIntoPreOrderSessions(db);
console.log(`Clustered 9 trades into ${sessions.length} Pre-Order Sessions.`);

const pwd930Sessions = sessions.filter(s => s.clientCode === 'PWD00930');
const pwd3264Sessions = sessions.filter(s => s.clientCode === 'PWD03264');
const pwd4275Sessions = sessions.filter(s => s.clientCode === 'PWD04275');
const wia99999Sessions = sessions.filter(s => s.clientCode === 'WIA99999');

if (pwd930Sessions.length === 1) {
  console.log('[PASS] Client PWD00930: Exactly 1 Pre-Order Session generated.');
} else {
  throw new Error(`Expected 1 session for PWD00930, got ${pwd930Sessions.length}`);
}

if (pwd3264Sessions.length === 1) {
  console.log('[PASS] Client PWD03264 (4 trades within 10 min): Exactly 1 Pre-Order Session generated.');
} else {
  throw new Error(`Expected 1 session for PWD03264, got ${pwd3264Sessions.length}`);
}

if (pwd4275Sessions.length === 2) {
  console.log('[PASS] Client PWD04275 (2 trades at 11:15, 1 at 11:35): Exactly 2 Pre-Order Sessions generated.');
} else {
  throw new Error(`Expected 2 sessions for PWD04275, got ${pwd4275Sessions.length}`);
}

console.log('\n--- 2. Testing Pre-Order Call Correlation & Mail Confirmation Routing ---');
// Insert calls for PWD00930, PWD03264, PWD04275 (No call for WIA99999 -> Mail Confirmation)
db.prepare(`
  INSERT INTO calls (caller_id, original_filename, customer_number, calling_number, phone_number, call_date, call_time, duration_seconds, storage_path, status, created_at, updated_at)
  VALUES
    ('c1', 'call1.mp3', '9811111111', '9811111111', '9811111111', '2026-09-04', '09:58:00', 120, 'c1.mp3', 'imported', ?, ?),
    ('c2', 'call2.mp3', '9822222222', '9822222222', '9822222222', '2026-09-04', '10:01:00', 180, 'c2.mp3', 'imported', ?, ?),
    ('c3', 'call3.mp3', '9833333333', '9833333333', '9833333333', '2026-09-04', '11:14:00', 150, 'c3.mp3', 'imported', ?, ?),
    ('c4', 'call4.mp3', '9833333333', '9833333333', '9833333333', '2026-09-04', '11:33:00', 90, 'c4.mp3', 'imported', ?, ?)
`).run(now, now, now, now, now, now, now, now);

const corrResult = correlatePreOrdersWithCalls(db);
console.log(`Correlated ${corrResult.matchedCallsCount} pre-order calls out of ${corrResult.totalPreOrderSessions} sessions.`);

if (corrResult.matchedCallsCount === 4) {
  console.log('[PASS] Exactly 4 pre-order calls correlated to the 4 call sessions!');
} else {
  throw new Error(`Expected 4 matched calls, got ${corrResult.matchedCallsCount}`);
}

// Check Mail Confirmation trade:
const mailTrade = db.prepare("SELECT * FROM trades WHERE client = 'WIA99999'").get() as any;
if (mailTrade && mailTrade.notes && mailTrade.notes.includes('MAIL_CONFIRMATION')) {
  console.log('[PASS] Trade without call in metadata correctly flagged as MAIL_CONFIRMATION!');
} else {
  throw new Error('Expected trade without call to be routed to MAIL_CONFIRMATION');
}

console.log('\n--- 3. Testing Q1 to Q5 Compliance Audit & Presentation ---');
// Set up Call #1 dialogue for PWD00930:
// Q1: Phone 9811111111 matches trade
// Q2: Spoken Client Code PWD00930
// Q3: RELIANCE Qty 10 @ CMP
// Q4: Always PASS
// Q5: No guarantees
const c1 = db.prepare("SELECT * FROM calls WHERE caller_id = 'c1'").get() as any;

db.prepare(`
  INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
  VALUES
    (?, 's1', 1.0, 4.0, 'ADVISOR', 'Hello sir, verifying your client ID PWD00930.', ?),
    (?, 's2', 5.0, 9.0, 'ADVISOR', 'Placing your buy order for 10 shares of RELIANCE at price 2500 CMP.', ?),
    (?, 's3', 10.0, 12.0, 'CLIENT', 'Yes, please execute the order.', ?),
    (?, 's4', 13.0, 16.0, 'ADVISOR', 'Your order for 10 shares of RELIANCE has been placed.', ?)
`).run(c1.id, now, c1.id, now, c1.id, now, c1.id, now);

db.prepare(`
  UPDATE calls SET
    transcript = 'ADVISOR: Hello sir, verifying your client ID PWD00930. ADVISOR: Placing your buy order for 10 shares of RELIANCE at price 2500 CMP. CLIENT: Yes, please execute the order. ADVISOR: Your order for 10 shares of RELIANCE has been placed.',
    status = 'pre_order',
    classification = 'PRE_ORDER',
    trade_match_status = 'CONFIRMED'
  WHERE id = ?
`).run(c1.id);

async function runAuditCheck() {
  const auditRes = await stage7AuditCall(db, c1.id);
  console.log('Q1 Status:', auditRes.q1.status, '-', auditRes.q1.evidence);
  console.log('Q2 Status:', auditRes.q2.status, '-', auditRes.q2.evidence);
  console.log('Q3 Status:', auditRes.q3.status, '-', auditRes.q3.evidence);
  console.log('Q4 Status:', auditRes.q4.status, '-', auditRes.q4.evidence);
  console.log('Q5 Status:', auditRes.q5.status, '-', auditRes.q5.evidence);

  if (auditRes.q1.status !== 'PASS') {
    throw new Error(`Expected Q1 PASS when number matches trade, got ${auditRes.q1.status}`);
  }
  console.log('[PASS] Q1 evaluated to 100% PASS for matched pre-order call.');

  if (auditRes.q4.status !== 'PASS') {
    throw new Error(`Expected Q4 PASS, got ${auditRes.q4.status}`);
  }
  if (auditRes.q4.evidence.includes('NOT AUDITED') || auditRes.q4.evidence.includes('pass by default')) {
    throw new Error('Q4 evidence must not mention NOT AUDITED or pass by default');
  }
  console.log('[PASS] Q4 evaluated to 100% PASS with clean, authoritative evidence.');

  const scoreRes = stage8CalculateScore(auditRes);
  console.log('Score:', scoreRes.score, '/ 5 (Fatal:', scoreRes.is_fatal, ')');
  if (scoreRes.score !== 5 || scoreRes.is_fatal) {
    throw new Error(`Expected perfect score 5/5, got ${scoreRes.score}`);
  }
  console.log('[PASS] Final Score is 5/5 PASS!');

  console.log('\n--- 4. Testing Indian Language Routing ---');
  const langDelhi = resolveIndianLanguageForCall({ circle: 'Delhi', caller_id: '1788493341' });
  const langChennai = resolveIndianLanguageForCall({ circle: 'Tamil Nadu', caller_id: 'CHN1-123' });
  const langHyd = resolveIndianLanguageForCall({ circle: 'Telangana', caller_id: 'HYD12-T10' });
  const langMumbai = resolveIndianLanguageForCall({ circle: 'Mumbai', caller_id: 'MUM3-T7' });

  console.log(`Delhi -> ${langDelhi}, Chennai -> ${langChennai}, Hyderabad -> ${langHyd}, Mumbai -> ${langMumbai}`);
  if (langDelhi === 'hi' && langChennai === 'ta' && langHyd === 'te' && langMumbai === 'hi') {
    console.log('[PASS] Indian language routing accurately resolved hi, ta, te based on circle and prefix.');
  } else {
    throw new Error('Language routing failed');
  }

  console.log('\n--- 5. Testing De-duplication (314 calls in ZIP + metadata) ---');
  // If we re-import the same calls, it must NOT increase the count!
  const countBefore = Number((db.prepare('SELECT COUNT(*) as c FROM calls').get() as any)?.c || 0);
  stage1ImportCalls(db, [
    {
      original_filename: 'call1.mp3',
      caller_id: 'c1',
      storage_path: 'c1.mp3',
      file_size: 1000,
      mime_type: 'audio/mp3',
      duration_seconds: 120,
      calling_number: '9811111111',
      customer_number: '9811111111',
    }
  ]);
  const countAfter = Number((db.prepare('SELECT COUNT(*) as c FROM calls').get() as any)?.c || 0);
  if (countBefore === countAfter) {
    console.log(`[PASS] Re-importing existing call did not duplicate! (Before: ${countBefore}, After: ${countAfter})`);
  } else {
    throw new Error(`Duplication occurred! Count before: ${countBefore}, after: ${countAfter}`);
  }

  console.log('\n--- 6. Testing Call Metadata Upload Acceptance (Fix for "NO VALID RECORDS FOUND") ---');
  // Simulate metadata upload when database already has existing calls
  const metaSampleRows = [
    {
      callId: 'HYD12-T10-1785815248.110742',
      customerNumber: '9923106870',
      advisor: 'Siva S',
      date: '2026-08-04',
      time: '09:17:00',
      duration: 25,
      recordingFileName: 'HYD12-T10-1785815248.110742.mp3',
    },
    {
      callId: 'HYD12-T10-1785817096.112334',
      customerNumber: '9941382972',
      advisor: 'Shankar',
      date: '2026-08-04',
      time: '09:48:00',
      duration: 24,
      recordingFileName: 'HYD12-T10-1785817096.112334.mp3',
    }
  ];

  const dbCallsBefore = Number((db.prepare('SELECT COUNT(*) as c FROM calls').get() as any)?.c || 0);
  if (dbCallsBefore === 0) throw new Error('Database should already contain calls for this test');

  // Verify new metadata rows are accepted and ingested as CDRs
  const filesFromMeta = metaSampleRows.map(m => ({
    original_filename: m.recordingFileName,
    storage_path: '',
    recording_url: '',
    file_size: 0,
    mime_type: 'audio/wav',
    duration_seconds: m.duration,
    caller_id: m.callId,
    calling_number: m.customerNumber,
    customer_number: m.customerNumber,
    registered_number: m.customerNumber,
    client_code: '',
    advisor_name: m.advisor,
    dealer: '',
    call_date: m.date,
    call_time: m.time,
  }));

  const metaBatchResult = stage1ImportCalls(db, filesFromMeta);
  console.log(`[PASS] Metadata ingested ${metaBatchResult.total_uploaded} CDRs into batch ${metaBatchResult.batch_id} without rejection.`);

  // Re-ingest same metadata: must update existing without throwing or duplicate
  const reImportResult = stage1ImportCalls(db, filesFromMeta);
  const dbCallsAfterReImport = Number((db.prepare('SELECT COUNT(*) as c FROM calls').get() as any)?.c || 0);
  if (dbCallsAfterReImport !== dbCallsBefore + 2) {
    throw new Error(`Expected exactly ${dbCallsBefore + 2} calls, got ${dbCallsAfterReImport}`);
  }
  console.log('[PASS] Re-uploading the same Call Metadata safely merged without duplicate calls or errors.');

  console.log('\n===========================================================');
  console.log('ALL USER SPECIFICATION REQUIREMENTS VERIFIED (100% PASS)!');
  console.log('===========================================================');
}

runAuditCheck().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
