import 'dotenv/config';
import { isStrictValidClientCode, formatCleanClientCode } from '../server/normalizer';
import { geminiPool } from '../server/gemini-pool';
import { DatabaseSync } from 'node:sqlite';
import { findAndAuditPreOrderForTrade } from '../server/pipeline/preorder-finder';
import type { TradeRecord } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('=== RUNNING TARGETED PRE-ORDER & GEMINI POOL TEST SUITE ===\n');

// -------------------------------------------------------------
// Test 1: Strict ADAM Client Code Formats
// -------------------------------------------------------------
console.log('--- Test 1: Client Code Strict Validation ---');

const validCodes = [
  'WIA1234',
  'WIA12345',
  'WIA123456',
  'WIF12345',
  'WIC12345',
  'WID12345',
  'WIG12345',
  'WIE12345',
  'FIA12345',
  'PWD12345',
];

for (const code of validCodes) {
  assert(isStrictValidClientCode(code), `Valid client code: ${code}`);
  assert(formatCleanClientCode(code) === code, `Normalized format: ${code}`);
}

// Spoken / Spaced inputs that should normalize to valid codes
assert(formatCleanClientCode('WIA 12345') === 'WIA12345', 'Normalized "WIA 12345" -> "WIA12345"');
assert(formatCleanClientCode('w i a 12345') === 'WIA12345', 'Normalized "w i a 12345" -> "WIA12345"');
assert(formatCleanClientCode('PWD-12345') === 'PWD12345', 'Normalized "PWD-12345" -> "PWD12345"');
assert(formatCleanClientCode('fia 12345') === 'FIA12345', 'Normalized "fia 12345" -> "FIA12345"');

// Invalid inputs that must be rejected
const invalidCodes = [
  'WIX12345',    // prefix not allowed
  'WIA123',      // only 3 digits
  'WIA1234567',  // 7 digits after prefix
  'ABC12345',    // prefix not allowed
  'XYZ99999',    // prefix not allowed
  'PWDX12345',   // invalid prefix
  '1234567',     // no prefix
];

for (const code of invalidCodes) {
  assert(!isStrictValidClientCode(code), `Correctly rejected invalid code: ${code}`);
}

// -------------------------------------------------------------
// Test 2: Gemini Key Pool Architecture
// -------------------------------------------------------------
console.log('\n--- Test 2: Gemini Key Pool Health & Capacity ---');

const activeKeys = geminiPool.getKeyCount();
const health = geminiPool.getPoolHealth();
assert(health.length === activeKeys, 'Health report length matches pool size');
if (activeKeys >= 1) {
  console.log(`✅ Gemini pool active key(s): count = ${activeKeys}`);
  console.log('Gemini Pool Health Snapshot:', health);
} else {
  console.log(`✅ Gemini pool verified: 0 active keys (offline test mode), health array cleanly initialized.`);
}

// -------------------------------------------------------------
// Test 3: Pre-Order Reverse-Walk Matching Logic
// -------------------------------------------------------------
console.log('\n--- Test 3: Pre-Order Reverse-Walk & Mail Fallback ---');

const inMemDb = new DatabaseSync(':memory:');
inMemDb.exec(`
  CREATE TABLE calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_name TEXT,
    canonical_call_id TEXT,
    storage_path TEXT,
    customer_number TEXT,
    phone_number TEXT,
    calling_number TEXT,
    caller_id TEXT,
    call_time TEXT,
    call_date TEXT,
    duration_seconds INTEGER,
    transcript TEXT,
    transcript_raw TEXT,
    transcript_status TEXT,
    transcript_model TEXT,
    matched_trade_id INTEGER,
    client_code TEXT,
    status TEXT,
    updated_at TEXT
  );

  CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT,
    client_code TEXT,
    symbol TEXT,
    quantity REAL,
    price REAL,
    trade_time TEXT,
    trade_date TEXT,
    phone_number TEXT,
    customer_number TEXT,
    status TEXT,
    notes TEXT
  );

  CREATE TABLE call_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    segment_id TEXT,
    start_time REAL,
    end_time REAL,
    speaker TEXT,
    text TEXT,
    created_at TEXT
  );

  CREATE TABLE scorecards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL UNIQUE,
    trade_id INTEGER,
    client_code TEXT,
    q1_status TEXT NOT NULL,
    q1_evidence TEXT,
    q2_status TEXT NOT NULL,
    q2_evidence TEXT,
    q3_status TEXT NOT NULL,
    q3_evidence TEXT,
    q4_status TEXT NOT NULL,
    q4_evidence TEXT,
    q5_status TEXT NOT NULL,
    q5_evidence TEXT,
    overall_score REAL NOT NULL,
    overall_status TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL
  );
`);

// Scenario A: Phone number NOT found in meta data -> Route to Mail Confirmation
const tradeMail: TradeRecord = {
  id: 101,
  client: 'WIA12345',
  symbol: 'INFY',
  quantity: 50,
  price: 1850,
  trade_time: '14:30:00',
  trade_date: '2026-10-05',
  phone_number: '9876500000', // Not in calls table
} as any;

const resMail = await findAndAuditPreOrderForTrade(inMemDb, tradeMail, 'WIA12345');
assert(resMail.outcomeType === 'MAIL_CONFIRMATION', 'Unmatched phone in metadata correctly routes to MAIL_CONFIRMATION');

// Scenario B: Phone number found in meta data, candidate call placed prior to trade execution
// Add 2 calls: one at 10:40 (earlier), one at 11:40 (closest before 11:44 trade)
inMemDb.prepare(`
  INSERT INTO calls (id, customer_number, phone_number, call_time, call_date, transcript, transcript_status)
  VALUES 
    (1, '9876543210', '9876543210', '10:40:00', '2026-10-05', 'Hello this is an inquiry call about market general trends.', 'VALID'),
    (2, '9876543210', '9876543210', '11:40:00', '2026-10-05', 'Advisor: Placing buy order for ACC quantity 100 shares at market CMP. Customer: Yes confirm and proceed please.', 'VALID');
`).run();

const tradeAcc: TradeRecord = {
  id: 202,
  client: 'WIA12345',
  symbol: 'ACC',
  quantity: 100,
  price: 2450,
  trade_time: '11:44:00',
  trade_date: '2026-10-05',
  phone_number: '9876543210',
} as any;

const resAcc = await findAndAuditPreOrderForTrade(inMemDb, tradeAcc, 'WIA12345');
assert(resAcc.outcomeType === 'VOICE_CALL_MATCHED', 'Found pre-order confirmation in call prior to trade');
assert(resAcc.matchedCallId === 2, 'Selected closest call at 11:40:00 (Call #2)');
assert(resAcc.fivePointAudit !== undefined, 'Generated 5-point equity dealer scorecard');
assert(resAcc.fivePointAudit?.q1_registered_number.status === 'PASS', 'Q1 Registered number matched');
assert(resAcc.fivePointAudit?.q2_regulatory_norms.status === 'PASS', 'Q2 Pre-order timing verified before trade');
assert(resAcc.fivePointAudit?.q4_customer_acknowledged.status === 'PASS', 'Q4 Customer acknowledged');
assert(resAcc.fivePointAudit?.q5_no_return_commitment.status === 'PASS', 'Q5 No return commitment');

console.log('\n=== ALL TARGETED TESTS PASSED PERFECTLY ===');
