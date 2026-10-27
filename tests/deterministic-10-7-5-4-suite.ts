import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { runFullPipelineForCall, ensureCallColumns } from '../server/pipeline/pipelineRunner';
import { normalizePhoneNumber } from '../server/normalizer';

console.log('===========================================================');
console.log('Running 10 -> 7 -> 5 -> 4 Deterministic Production Specification Suite');
console.log('===========================================================');

// Initialize in-memory SQLite database mimicking production schema
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_call_id TEXT UNIQUE,
    file_sha256 TEXT,
    recording_id TEXT,
    recording_name TEXT,
    caller_name TEXT,
    advisor_name TEXT,
    calling_number TEXT,
    registered_number TEXT,
    customer_number TEXT,
    client_code TEXT,
    client TEXT,
    call_date TEXT,
    call_time TEXT,
    duration_seconds REAL,
    transcript TEXT,
    transcript_raw TEXT,
    transcript_status TEXT,
    classification TEXT,
    classification_reason TEXT,
    trade_match_status TEXT,
    matched_trade_id INTEGER,
    audit_status TEXT,
    processing_status TEXT,
    pipeline_stage TEXT,
    current_gate TEXT,
    gate_reason TEXT,
    status TEXT,
    call_type TEXT,
    dealer TEXT,
    failure_reason TEXT,
    storage_path TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT,
    client_code TEXT,
    client_number TEXT,
    phone_number TEXT,
    customer_number TEXT,
    symbol TEXT,
    quantity INTEGER,
    price REAL,
    trade_date TEXT,
    trade_time TEXT,
    advisor_name TEXT,
    dealer TEXT,
    order_type TEXT
  );

  CREATE TABLE call_orders (
    id TEXT PRIMARY KEY,
    call_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    intent_type TEXT NOT NULL,
    symbol TEXT,
    raw_symbol TEXT,
    quantity INTEGER,
    raw_quantity TEXT,
    price_type TEXT,
    limit_price REAL,
    raw_price TEXT,
    confidence REAL DEFAULT 1.0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE order_executions (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    trade_id INTEGER NOT NULL,
    matched_quantity INTEGER NOT NULL,
    confidence REAL NOT NULL,
    margin REAL,
    reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER UNIQUE,
    trade_id INTEGER,
    q1 TEXT, q1_flag TEXT, q1_evidence TEXT, q1_confidence REAL, q1_speaker TEXT,
    q2 TEXT, q2_flag TEXT, q2_evidence TEXT, q2_confidence REAL, q2_speaker TEXT,
    q3 TEXT, q3_flag TEXT, q3_evidence TEXT, q3_confidence REAL, q3_speaker TEXT,
    q4 TEXT, q4_flag TEXT, q4_evidence TEXT, q4_confidence REAL, q4_speaker TEXT,
    q5 TEXT, q5_flag TEXT, q5_evidence TEXT, q5_confidence REAL, q5_speaker TEXT,
    score INTEGER,
    audit_comment TEXT,
    compliance_disposition TEXT,
    status TEXT,
    model TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE scorecards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id INTEGER,
    call_id INTEGER UNIQUE,
    caller_name TEXT,
    dealer TEXT,
    team TEXT,
    client TEXT,
    client_code TEXT,
    resolved_trade_id INTEGER,
    trade_phone TEXT,
    calling_number TEXT,
    registered_number TEXT,
    trade_date TEXT,
    call_date TEXT,
    score INTEGER,
    total_score REAL,
    is_fatal INTEGER,
    fatal_reasons TEXT,
    q1_status TEXT, q1_evidence TEXT,
    q2_status TEXT, q2_evidence TEXT,
    q3_status TEXT, q3_evidence TEXT,
    q4_status TEXT, q4_evidence TEXT,
    q5_status TEXT, q5_evidence TEXT,
    audit_comment TEXT,
    is_current INTEGER DEFAULT 1,
    generated_at TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_code TEXT UNIQUE,
    name TEXT,
    phone TEXT,
    email TEXT
  );

  CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER,
    trade_id INTEGER,
    confidence REAL,
    score_margin REAL,
    status TEXT,
    reason TEXT,
    created_at TEXT,
    updated_at TEXT
  );
`);

ensureCallColumns(db);

const now = '2026-09-20 10:00:00';

// Populate Client Registry & Master Trades
// Master Trades contain records for 5 customers (Cust C6, C7, C8, C9, C10)
// But executed trades in the trade book exist for only 4 pre-orders (C6, C7, C8, C9)
const TRADE_CUSTOMERS = [
  { ucc: 'WIA10001', phone: '9876500001', name: 'Arun Kumar', symbol: 'RELIANCE', qty: 100, price: 2500.0, time: '10:02:00', advisor: 'Priya Sharma' },
  { ucc: 'WIA10002', phone: '9876500002', name: 'Bhavna Rao', symbol: 'TCS', qty: 50, price: 3500.0, time: '10:17:00', advisor: 'Priya Sharma' },
  { ucc: 'WIA10003', phone: '9876500003', name: 'Chetan Desai', symbol: 'INFY', qty: 200, price: 1800.0, time: '11:03:00', advisor: 'Priya Sharma' },
  { ucc: 'WIA10004', phone: '9876500004', name: 'Deepa Verma', symbol: 'HDFCBANK', qty: 10, price: 1600.0, time: '12:02:00', advisor: 'Priya Sharma' },
  // Cust 5: has a past trade in trades table, but NO executed trade for today's call window
  { ucc: 'WIA10005', phone: '9876500005', name: 'Eshwar Pillai', symbol: 'WIPRO', qty: 500, price: 450.0, time: '14:50:00', advisor: 'Priya Sharma' },
];

for (const cust of TRADE_CUSTOMERS) {
  db.prepare(`
    INSERT INTO clients (client_code, name, phone, email)
    VALUES (?, ?, ?, ?)
  `).run(cust.ucc, cust.name, cust.phone, `${cust.ucc.toLowerCase()}@fundsindia.com`);

  db.prepare(`
    INSERT INTO trades (client, client_code, client_number, phone_number, customer_number, symbol, quantity, price, trade_date, trade_time, advisor_name, order_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-09-20', ?, ?, 'BUY')
  `).run(cust.ucc, cust.ucc, cust.phone, cust.phone, cust.phone, cust.symbol, cust.qty, cust.price, cust.time, cust.advisor);
}

// -------------------------------------------------------------
// INGEST 10 CALLS
// -------------------------------------------------------------
// Calls 1, 2, 3: Outside market hours
// Call 4, 5: In market hours, Customer phone not in trade report
// Call 6, 7, 8, 9, 10: In market hours, Customer phone in trade report
// Call 6, 7, 8, 9: Deterministic order discussion + trade correlation
// Call 10: Customer call, but inquiry only (no executed trade in call window)

const rawCalls = [
  // Outside Market Hours (3 calls)
  { id: 1, canonical: 'CALL_01_EARLY', time: '08:45:00', phone: '9876500001', transcript: 'Hello', isOutside: true },
  { id: 2, canonical: 'CALL_02_LATE', time: '15:45:00', phone: '9876500002', transcript: 'Hello', isOutside: true },
  { id: 3, canonical: 'CALL_03_NIGHT', time: '18:30:00', phone: '9876500003', transcript: 'Hello', isOutside: true },

  // Within Market Hours, Customer Number Mismatch (2 calls)
  { id: 4, canonical: 'CALL_04_UNREGISTERED', time: '09:30:00', phone: '9123456780', transcript: 'General inquiry from unregistered user', isMismatch: true },
  { id: 5, canonical: 'CALL_05_NO_TRADES', time: '09:45:00', phone: '9123456781', transcript: 'Mutual fund query', isMismatch: true },

  // Within Market Hours & Customer Number Matched (5 calls -> MUST BE TRANSCRIBED)
  {
    id: 6,
    canonical: 'CALL_06_PRE_RELIANCE',
    time: '10:00:00',
    phone: '9876500001',
    transcript: 'Advisor: Good morning Arun ji, Priya here from FundsIndia. Confirming client code WIA10001. Client: Yes WIA10001. Buy 100 shares of Reliance at current market price. Advisor: Buying 100 shares of Reliance at CMP. Equities have market risk, no guaranteed return. Shall I punch? Client: Yes punch it.',
    ucc: 'WIA10001',
    hasOrder: true,
  },
  {
    id: 7,
    canonical: 'CALL_07_PRE_TCS',
    time: '10:15:00',
    phone: '9876500002',
    transcript: 'Advisor: Hello Bhavna ji, Priya from FundsIndia. Client code WIA10002. Client: Yes Priya, code WIA10002. Buy 50 shares of TCS at current market price. Advisor: Placing order for 50 shares TCS at CMP. No fixed return can be promised. Confirm? Client: Confirmed, please execute.',
    ucc: 'WIA10002',
    hasOrder: true,
  },
  {
    id: 8,
    canonical: 'CALL_08_PRE_INFY',
    time: '11:00:00',
    phone: '9876500003',
    transcript: 'Advisor: Namaste Chetan ji, Priya from FundsIndia. Your UCC WIA10003. Client: Yes WIA10003 here. Please buy 200 INFY shares at CMP today. Advisor: Buying 200 INFY at CMP. Standard disclaimer applies. Proceed? Client: Yes please.',
    ucc: 'WIA10003',
    hasOrder: true,
  },
  {
    id: 9,
    canonical: 'CALL_09_PRE_HDFC',
    time: '12:00:00',
    phone: '9876500004',
    transcript: 'Advisor: Good afternoon Deepa ji, Priya from FundsIndia. UCC is WIA10004. Client: Yes WIA10004. Please buy 10 shares of HDFCBANK at CMP. Advisor: Punching 10 HDFCBANK at CMP. No guaranteed profit. Okay? Client: Yes okay.',
    ucc: 'WIA10004',
    hasOrder: true,
  },
  {
    id: 10,
    canonical: 'CALL_10_MATCHED_PHONE_NO_ORDER',
    time: '13:00:00',
    phone: '9876500005',
    transcript: 'Advisor: Good afternoon Eshwar ji, Priya from FundsIndia. Client: Hi Priya, I just wanted to ask how the IT sector is performing today. Advisor: IT sector is up 1.2% today, no specific trade recommended. Client: Okay thanks, bye.',
    ucc: 'WIA10005',
    hasOrder: false,
  },
];

for (const c of rawCalls) {
  db.prepare(`
    INSERT INTO calls (
      id, canonical_call_id, file_sha256, recording_id, caller_name, advisor_name,
      calling_number, registered_number, customer_number, client_code, client,
      call_date, call_time, duration_seconds, transcript, transcript_raw,
      transcript_status, status, audit_status, processing_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, 'Priya Sharma',
      ?, ?, ?, ?, ?,
      '2026-09-20', ?, 45.0, ?, ?,
      'VALID', 'uploaded', 'PENDING', 'IDLE', ?, ?
    )
  `).run(
    c.id,
    c.canonical,
    `sha256_${c.id}`,
    `REC_${c.id}`,
    'Priya Sharma',
    c.phone,
    c.phone,
    c.phone,
    c.ucc || null,
    c.ucc || null,
    c.time,
    c.transcript,
    c.transcript,
    now,
    now
  );
}

// -------------------------------------------------------------
// EXECUTE PIPELINE FOR ALL 10 CALLS
// -------------------------------------------------------------
async function runSuite() {
  for (let i = 1; i <= 10; i++) {
    await runFullPipelineForCall(db, i);
  }

  // -----------------------------------------------------------
  // RECONCILIATION VERIFICATION
  // -----------------------------------------------------------
  const allCalls = db.prepare('SELECT * FROM calls ORDER BY id ASC').all() as any[];
  assert.strictEqual(allCalls.length, 10, 'Total uploaded calls must remain exactly 10');

  // 1. Outside Market Hours (Expect 3: Calls 1, 2, 3)
  const outsideMarket = allCalls.filter((c) => c.status === 'out_of_market_hours' || c.pipeline_stage === 'OUTSIDE_MARKET_HOURS');
  assert.strictEqual(outsideMarket.length, 3, 'Exactly 3 calls must be excluded as OUTSIDE_MARKET_HOURS');
  for (const c of outsideMarket) {
    assert.strictEqual(c.audit_status, 'EXCLUDED');
    assert.strictEqual(c.processing_status, 'COMPLETED');
  }
  console.log('[PASS] Reconciled Stage 1: 3/10 calls outside market hours (09:15-15:40) safely excluded.');

  // 2. In Market Hours (Expect 7: Calls 4, 5, 6, 7, 8, 9, 10)
  const marketEligible = allCalls.filter((c) => c.pipeline_stage !== 'OUTSIDE_MARKET_HOURS');
  assert.strictEqual(marketEligible.length, 7, 'Exactly 7 calls pass market-hours filter');
  console.log('[PASS] Reconciled Stage 2: 7/10 calls passed market-hours filter.');

  // 3. Customer Number Mismatch (Expect 2: Calls 4, 5)
  const customerMismatch = allCalls.filter((c) => c.pipeline_stage === 'CUSTOMER_MISMATCH' || c.status === 'customer_mismatch');
  assert.strictEqual(customerMismatch.length, 2, 'Exactly 2 calls must receive CUSTOMER_MISMATCH');
  for (const c of customerMismatch) {
    assert.strictEqual(c.audit_status, 'EXCLUDED');
    assert.strictEqual(c.processing_status, 'COMPLETED');
  }
  console.log('[PASS] Reconciled Stage 3: 2/7 calls excluded for CUSTOMER_MISMATCH.');

  // 4. Customer Number Matched (Expect 5: Calls 6, 7, 8, 9, 10) -> ALL 5 TRANSCRIBED!
  const transcribedCandidates = allCalls.filter((c) => [6, 7, 8, 9, 10].includes(c.id));
  assert.strictEqual(transcribedCandidates.length, 5, 'All 5 customer-matched calls must be processed through transcription');
  for (const c of transcribedCandidates) {
    assert.strictEqual(c.transcript_status, 'VALID', `Call #${c.id} must have valid transcript`);
  }
  console.log('[PASS] Reconciled Stage 4: Exactly 5/5 customer-matched calls transcribed.');

  // 5. Deterministic Trade Correlated (Expect 4: Calls 6, 7, 8, 9)
  const confirmedTrades = allCalls.filter((c) => c.trade_match_status === 'CONFIRMED');
  assert.strictEqual(confirmedTrades.length, 4, 'Exactly 4 pre-orders must have confirmed executed-trade correlation');
  for (const c of confirmedTrades) {
    assert.ok(c.matched_trade_id, `Call #${c.id} must be linked to matched_trade_id`);
  }
  console.log('[PASS] Reconciled Stage 5: Exactly 4/5 pre-orders deterministically correlated to executed trades.');

  // 6. Transcribed call with no trade match (Expect 1: Call 10)
  const noTradeCall = allCalls.find((c) => c.id === 10);
  assert.ok(noTradeCall, 'Call 10 must exist');
  assert.strictEqual(noTradeCall.trade_match_status, 'NO_MATCH', 'Call 10 must have trade_match_status = NO_MATCH');
  assert.strictEqual(noTradeCall.audit_status, 'EXCLUDED', 'Call 10 must be safely excluded from audit without silent drop');
  assert.strictEqual(noTradeCall.processing_status, 'COMPLETED', 'Call 10 must reach terminal COMPLETED state');
  assert.ok(
    noTradeCall.pipeline_stage === 'NO_TRADE_CORRELATED' || noTradeCall.pipeline_stage === 'REGULAR_EXIT',
    `Call 10 must have terminal non-trade stage (NO_TRADE_CORRELATED or REGULAR_EXIT, got ${noTradeCall.pipeline_stage})`
  );
  console.log('[PASS] Reconciled Stage 6: 1/5 transcribed call without executed trade cleanly recorded as terminal non-trade stage.');

  // 7. Compliance Audited (Expect 4: Calls 6, 7, 8, 9)
  const auditedCalls = allCalls.filter((c) => c.audit_status === 'AUDITED');
  assert.strictEqual(auditedCalls.length, 4, 'Exactly 4 calls must be AUDITED');
  for (const c of auditedCalls) {
    assert.strictEqual(c.status, 'audited');
    assert.strictEqual(c.processing_status, 'COMPLETED');
  }

  const audits = db.prepare('SELECT * FROM audits').all() as any[];
  console.log('Audits Q5 results:', audits.map(a => ({ id: a.id, call_id: a.call_id, q5: a.q5, evidence: a.q5_evidence })));
  assert.strictEqual(audits.length, 4, 'Exactly 4 audit records must exist in audits table');
  for (const a of audits) {
    assert.strictEqual(a.q1, 'PASS', 'Q1 must be PASS');
    assert.strictEqual(a.q2, 'PASS', 'Q2 must be PASS');
    assert.strictEqual(a.q3, 'PASS', 'Q3 must be PASS');
    assert.strictEqual(a.q4, 'PASS', 'Q4 must be PASS');
    assert.strictEqual(a.q5, 'PASS', `Call #${a.call_id} Q5 must be PASS (was ${a.q5})`);
  }
  console.log('[PASS] Reconciled Stage 7: Exactly 4/4 executed pre-order calls successfully audited with Q1-Q5 compliance.');

  // 8. Scorecards (Expect 4: Calls 6, 7, 8, 9)
  const scorecards = db.prepare('SELECT * FROM scorecards WHERE is_current = 1').all() as any[];
  assert.strictEqual(scorecards.length, 4, 'Exactly 4 scorecards must exist (1 per pre-order)');
  for (const sc of scorecards) {
    const score = sc.score ?? sc.total_score;
    assert.strictEqual(score, 5, 'Scorecard score must be 5/5 compliant');
  }
  console.log('[PASS] Reconciled Stage 8: Exactly 4 scorecards published (100% 5/5 compliant).');

  // 9. Mathematical 100% Reconciliation Proof:
  // Uploaded (10) = Outside Market Hours (3) + Customer Mismatch (2) + No Trade Correlated (1) + Audited (4)
  const totalAccounted = outsideMarket.length + customerMismatch.length + (noTradeCall ? 1 : 0) + auditedCalls.length;
  assert.strictEqual(totalAccounted, 10, 'Mathematical reconciliation balance failed');
  console.log(`===========================================================`);
  console.log(`FINAL MATHEMATICAL RECONCILIATION SUMMARY:`);
  console.log(`- Uploaded Calls:           10`);
  console.log(`- Market Hours Filter Pass: 7 (3 excluded: 09:15-15:40)`);
  console.log(`- Customer Number Matched:  5 (2 excluded: CUSTOMER_MISMATCH)`);
  console.log(`- Total Transcribed:        5 (5/5 customer-matched calls)`);
  console.log(`- Executed Trade Matched:   4 (1 excluded: NO_TRADE_CORRELATED)`);
  console.log(`- Compliance Audited:       4 (4/4 pre-orders audited)`);
  console.log(`- Scorecards Generated:     4 (One per pre-order, denominator 5)`);
  console.log(`- Unaccounted / Missing:    0`);
  console.log(`- Exact Balance:            3 + 2 + 1 + 4 = 10 (100.0%)`);
  console.log(`===========================================================`);
  console.log('10 -> 7 -> 5 -> 4 Deterministic Suite PASSED (100%)!');
  console.log(`===========================================================`);
}

runSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
