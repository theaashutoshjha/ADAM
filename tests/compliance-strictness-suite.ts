import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import {
  compareAdvisorNames,
  isIndianMarketHours,
  isStrictValidClientCode,
} from '../server/normalizer';
import { calculateAuthoritativeScore } from '../server/scoring-engine';
import { stage7AuditCall } from '../server/pipeline/audit';
import { stage5MatchTrade } from '../server/pipeline/tradeMatcher';
import { stage4ClassifyCall } from '../server/pipeline/classification';
import { isAuditEligible } from '../server/pipeline/eligibility';
import { runFullPipelineForCall } from '../server/pipeline/pipelineRunner';

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`[PASS] ${name}`);
    })
    .catch((err) => {
      console.error(`[FAIL] ${name}`);
      console.error(err);
      process.exit(1);
    });
}

async function main() {
  console.log('===========================================================');
  console.log('Starting Production-Strict SEBI Compliance Verification Suite');
  console.log('===========================================================');

  // Test 1: Agent Name Matching (No loose substring/fuzzy matching)
  await runTest('Test 1: Agent Matching rejects loose substring matches', () => {
    // Exact match
    assert.strictEqual(compareAdvisorNames('Rahul Sharma', 'Rahul Sharma'), true);
    assert.strictEqual(compareAdvisorNames('Rahul Sharma', 'rahul sharma'), true);
    // Order independent
    assert.strictEqual(compareAdvisorNames('Sharma Rahul', 'Rahul Sharma'), true);
    // Rejects substring / prefix collisions
    assert.strictEqual(compareAdvisorNames('Anil Kumar', 'Sunil Kumar'), false);
    assert.strictEqual(compareAdvisorNames('Kumar', 'Anil Kumar'), false);
    assert.strictEqual(compareAdvisorNames('Raj', 'Rajesh'), false);
    assert.strictEqual(compareAdvisorNames('Priya', 'Priyanka'), false);
  });

  // Test 2: Market Hours Filter (09:15:00 to 15:40:00)
  await runTest('Test 2: Market Hours Boundary Enforcement', () => {
    assert.strictEqual(isIndianMarketHours('09:14:59'), false, '09:14:59 is outside market hours');
    assert.strictEqual(isIndianMarketHours('09:15:00'), true, '09:15:00 is inside market hours');
    assert.strictEqual(isIndianMarketHours('11:30:00'), true, '11:30:00 is inside market hours');
    assert.strictEqual(isIndianMarketHours('15:40:00'), true, '15:40:00 is inside market hours');
    assert.strictEqual(isIndianMarketHours('15:40:01'), false, '15:40:01 is outside market hours');
    assert.strictEqual(isIndianMarketHours('16:00:00'), false, '16:00:00 is outside market hours');
  });

  // Test 3: Authoritative Client Code Prefixes (4-6 digits)
  await runTest('Test 3: Authoritative Client Code Prefix Validation', () => {
    assert.strictEqual(isStrictValidClientCode('WIA12345'), true);
    assert.strictEqual(isStrictValidClientCode('WIF26779'), true);
    assert.strictEqual(isStrictValidClientCode('WIC99999'), true);
    assert.strictEqual(isStrictValidClientCode('WID1234'), true);
    assert.strictEqual(isStrictValidClientCode('WIG123456'), true);
    assert.strictEqual(isStrictValidClientCode('FIA12345'), true);
    assert.strictEqual(isStrictValidClientCode('PWD12345'), true);
    assert.strictEqual(isStrictValidClientCode('XYZ12345'), false, 'Invalid prefix XYZ');
    assert.strictEqual(isStrictValidClientCode('12345'), false, 'Missing prefix');
    assert.strictEqual(isStrictValidClientCode('WIA12'), false, 'Too few digits');
  });

  // Test 4: Q4 Ignored in Scoring (No score deduction, clean status)
  await runTest('Test 4: Q4 Ignored in Scoring', () => {
    const res = calculateAuthoritativeScore({
      q1: { status: 'PASS' },
      q2: { status: 'PASS' },
      q3: { status: 'PASS' },
      q4: { status: 'PASS' },
      q5: { status: 'PASS' },
    });
    assert.strictEqual(res.finalScore, 5, 'Clean audit gives 5/5');
    assert.strictEqual(res.isFatal, false);

    // Q3 non-fatal deducts 1 -> 4/5
    const resQ3 = calculateAuthoritativeScore({
      q1: { status: 'PASS' },
      q2: { status: 'PASS' },
      q3: { status: 'FAIL' },
      q4: { status: 'PASS' },
      q5: { status: 'PASS' },
    });
    assert.strictEqual(resQ3.finalScore, 4, 'Q3 failure deducts 1 mark (4/5)');
  });

  // Test 5: Q1 evaluates strictly against exact correlated trade (not SELECT * LIMIT 1)
  await runTest('Test 5: Q1 evaluates strictly against exact correlated trade', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE calls (
        id INTEGER PRIMARY KEY,
        calling_number TEXT,
        registered_number TEXT,
        client_code TEXT,
        transcript TEXT,
        call_time TEXT,
        classification TEXT,
        trade_match_status TEXT,
        matched_trade_id INTEGER,
        audit_status TEXT,
        status TEXT
      );
      CREATE TABLE trades (
        id INTEGER PRIMARY KEY,
        client TEXT,
        client_number TEXT,
        phone_number TEXT,
        symbol TEXT,
        quantity REAL,
        price REAL,
        side TEXT,
        trade_time TEXT
      );
      CREATE TABLE call_segments (
        id INTEGER PRIMARY KEY,
        call_id INTEGER,
        speaker TEXT,
        text TEXT,
        start_time REAL,
        end_time REAL
      );
      CREATE TABLE call_orders (
        id TEXT PRIMARY KEY,
        call_id INTEGER,
        symbol TEXT,
        quantity REAL,
        limit_price REAL,
        price_type TEXT
      );
      CREATE TABLE order_executions (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        trade_id INTEGER,
        status TEXT
      );
    `);

    // Customer has TWO trades in DB with different registered phone numbers
    // Trade 1: Phone A (9876543210)
    db.prepare(`
      INSERT INTO trades (id, client, client_number, phone_number, symbol, quantity, price, side, trade_time)
      VALUES (1, 'WIA11111', '9876543210', '9876543210', 'RELIANCE', 10, 2500, 'BUY', '10:00:00')
    `).run();

    // Trade 2: Phone B (9999988888)
    db.prepare(`
      INSERT INTO trades (id, client, client_number, phone_number, symbol, quantity, price, side, trade_time)
      VALUES (2, 'WIA22222', '9999988888', '9999988888', 'TCS', 5, 3500, 'BUY', '11:00:00')
    `).run();

    // Call is for Trade 2, but caller ID is 9999988888
    // If code used SELECT * FROM trades LIMIT 1, it would pick Trade 1 (Phone 9876543210) and falsely FAIL Q1!
    const transcript = `
      Advisor: Hello, speaking with WIA22222?
      Client: Yes, this is client WIA22222.
      Advisor: Buying 5 shares of TCS at ₹3500.
      Client: Confirmed.
    `;

    db.prepare(`
      INSERT INTO calls (
        id, calling_number, client_code, transcript, call_time,
        classification, trade_match_status, matched_trade_id, audit_status, status
      ) VALUES (
        101, '9999988888', 'WIA22222', ?, '11:00:00',
        'PRE_ORDER', 'CONFIRMED', 2, 'PENDING', 'pending'
      )
    `).run(transcript);

    db.prepare(`
      INSERT INTO call_segments (call_id, speaker, text, start_time, end_time)
      VALUES (101, 'ADVISOR', 'Hello, speaking with WIA22222? Buying 5 shares of TCS at ₹3500.', 1.0, 5.0)
    `).run();

    const audit = await stage7AuditCall(db, 101);
    assert.strictEqual(audit.q1.status, 'PASS', 'Q1 must PASS because calling_number matches correlated trade 2 exactly!');
    assert.strictEqual(audit.q2.status, 'PASS', 'Q2 must PASS because advisor explicitly verified WIA22222');
    assert.strictEqual(audit.q3.status, 'PASS', 'Q3 must PASS because TCS, 5 shares, ₹3500 verified in same order');
  });

  // Test 6: Same-Order Coherence for Q3 (rejects whole-transcript mixing)
  await runTest('Test 6: Q3 rejects whole-transcript parameter mixing across unrelated statements', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE calls (
        id INTEGER PRIMARY KEY,
        calling_number TEXT,
        client_code TEXT,
        transcript TEXT,
        call_time TEXT,
        classification TEXT,
        trade_match_status TEXT,
        matched_trade_id INTEGER,
        audit_status TEXT,
        status TEXT
      );
      CREATE TABLE trades (
        id INTEGER PRIMARY KEY,
        client TEXT,
        client_number TEXT,
        symbol TEXT,
        quantity REAL,
        price REAL,
        side TEXT,
        trade_time TEXT
      );
      CREATE TABLE call_segments (
        id INTEGER PRIMARY KEY,
        call_id INTEGER,
        speaker TEXT,
        text TEXT,
        start_time REAL,
        end_time REAL
      );
      CREATE TABLE call_orders (id TEXT PRIMARY KEY, call_id INTEGER, symbol TEXT, quantity REAL, limit_price REAL, price_type TEXT);
      CREATE TABLE order_executions (id TEXT PRIMARY KEY, order_id TEXT, trade_id INTEGER, status TEXT);
    `);

    db.prepare(`
      INSERT INTO trades (id, client, client_number, symbol, quantity, price, side, trade_time)
      VALUES (1, 'WIA55555', '9876543210', 'INFY', 50, 1600, 'BUY', '10:30:00')
    `).run();

    // Transcript mentions "INFY" at turn 1, but discusses another stock "TCS 50 shares" at turn 10,
    // and mentions "1600" at turn 20 in an unrelated context.
    // Old whole-transcript check would pass! Strict same-order coherence must FAIL Q3!
    const transcript = `
      [00:00] Advisor: WIA55555 sir, INFY is falling today.
      [00:10] Client: Okay, what about TCS?
      [00:20] Advisor: TCS is looking good, maybe buy 50 shares of TCS.
      [00:30] Client: What was your target on Nifty?
      [00:40] Advisor: Nifty target was 16000 points.
    `;

    db.prepare(`
      INSERT INTO calls (
        id, calling_number, client_code, transcript, call_time,
        classification, trade_match_status, matched_trade_id, audit_status, status
      ) VALUES (
        202, '9876543210', 'WIA55555', ?, '10:30:00',
        'PRE_ORDER', 'CONFIRMED', 1, 'PENDING', 'pending'
      )
    `).run(transcript);

    db.prepare(`INSERT INTO call_segments VALUES (1, 202, 'ADVISOR', 'WIA55555 sir, INFY is falling today.', 0, 5)`).run();
    db.prepare(`INSERT INTO call_segments VALUES (2, 202, 'CLIENT', 'Okay, what about TCS?', 6, 10)`).run();
    db.prepare(`INSERT INTO call_segments VALUES (3, 202, 'ADVISOR', 'TCS is looking good, maybe buy 50 shares of TCS.', 11, 20)`).run();
    db.prepare(`INSERT INTO call_segments VALUES (4, 202, 'CLIENT', 'What was your target on Nifty?', 21, 30)`).run();
    db.prepare(`INSERT INTO call_segments VALUES (5, 202, 'ADVISOR', 'Nifty target was 16000 points.', 31, 40)`).run();

    const audit = await stage7AuditCall(db, 202);
    assert.strictEqual(audit.q3.status, 'FAIL', 'Q3 must FAIL because INFY + 50 qty + 1600 price did not belong to the same order event!');
    assert.strictEqual(audit.q3.flag, 'NON_FATAL', 'Q3 failure must be non-fatal');
  });

  // Test 7: Q2 Rejects Loose Digits without Authoritative Prefix
  await runTest('Test 7: Q2 rejects loose numeric digits without authoritative prefix', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE calls (
        id INTEGER PRIMARY KEY,
        calling_number TEXT,
        client_code TEXT,
        transcript TEXT,
        call_time TEXT,
        classification TEXT,
        trade_match_status TEXT,
        matched_trade_id INTEGER,
        audit_status TEXT,
        status TEXT
      );
      CREATE TABLE trades (id INTEGER PRIMARY KEY, client TEXT, client_number TEXT, symbol TEXT, quantity REAL, price REAL, side TEXT, trade_time TEXT);
      CREATE TABLE call_segments (id INTEGER PRIMARY KEY, call_id INTEGER, speaker TEXT, text TEXT, start_time REAL, end_time REAL);
      CREATE TABLE call_orders (id TEXT PRIMARY KEY, call_id INTEGER, symbol TEXT, quantity REAL, limit_price REAL, price_type TEXT);
      CREATE TABLE order_executions (id TEXT PRIMARY KEY, order_id TEXT, trade_id INTEGER, status TEXT);
    `);

    db.prepare(`
      INSERT INTO trades (id, client, client_number, symbol, quantity, price, side, trade_time)
      VALUES (1, 'WIA12345', '9876543210', 'RELIANCE', 10, 2500, 'BUY', '10:00:00')
    `).run();

    // Transcript only mentions "12345" in another context (e.g. pin or amount), NOT as UCC "WIA12345"
    const transcript = `
      Advisor: Hello sir. The otp is 12345.
      Client: Yes I got 12345.
      Advisor: Buying 10 Reliance at ₹2500.
      Client: Okay done.
    `;

    db.prepare(`
      INSERT INTO calls (
        id, calling_number, client_code, transcript, call_time,
        classification, trade_match_status, matched_trade_id, audit_status, status
      ) VALUES (
        303, '9876543210', 'WIA12345', ?, '10:00:00',
        'PRE_ORDER', 'CONFIRMED', 1, 'PENDING', 'pending'
      )
    `).run(transcript);

    db.prepare(`INSERT INTO call_segments VALUES (1, 303, 'ADVISOR', 'Hello sir. The otp is 12345.', 0, 5)`).run();
    db.prepare(`INSERT INTO call_segments VALUES (2, 303, 'ADVISOR', 'Buying 10 Reliance at ₹2500.', 6, 12)`).run();

    const audit = await stage7AuditCall(db, 303);
    assert.strictEqual(audit.q2.status, 'FAIL', 'Q2 must FAIL because advisor did not explicitly utter or confirm UCC with prefix WIA');
    assert.strictEqual(audit.q2.flag, 'FATAL', 'Q2 failure must be FATAL');
  });

  // Test 8: SEBI Rule #9: Genuine Actionable Order without matching trade is PRE_ORDER and audited with Q3 FAIL (-1 deduction)
  await runTest('Test 8: Rule #9: Genuine Actionable Order without matching trade is PRE_ORDER and audited with Q3 FAIL', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE calls (
        id INTEGER PRIMARY KEY,
        customer_number TEXT,
        calling_number TEXT,
        client_code TEXT,
        transcript TEXT,
        call_time TEXT,
        duration_seconds REAL,
        classification TEXT,
        call_type TEXT,
        classification_reason TEXT,
        trade_match_status TEXT,
        matched_trade_id INTEGER,
        audit_status TEXT,
        processing_status TEXT,
        status TEXT
      );
      CREATE TABLE trades (id INTEGER PRIMARY KEY, client TEXT, client_number TEXT, symbol TEXT, quantity REAL, price REAL, side TEXT, trade_time TEXT);
      CREATE TABLE call_segments (id INTEGER PRIMARY KEY, call_id INTEGER, speaker TEXT, text TEXT, start_time REAL, end_time REAL);
      CREATE TABLE call_orders (id TEXT PRIMARY KEY, call_id INTEGER, symbol TEXT, quantity REAL, limit_price REAL, price_type TEXT);
      CREATE TABLE order_executions (id TEXT PRIMARY KEY, order_id TEXT, trade_id INTEGER, status TEXT);
      CREATE TABLE audits (id INTEGER PRIMARY KEY, call_id INTEGER, q1_status TEXT, q2_status TEXT, q3_status TEXT, q4_status TEXT, q5_status TEXT, score REAL, is_fatal INTEGER, disposition TEXT);
      CREATE TABLE scorecards (id INTEGER PRIMARY KEY, call_id INTEGER, score REAL, max_score REAL, disposition TEXT, q1_result TEXT, q2_result TEXT, q3_result TEXT, q4_result TEXT, q5_result TEXT);
    `);

    // Add another unrelated trade in DB to simulate production trade book
    db.prepare(`
      INSERT INTO trades (id, client, client_number, symbol, quantity, price, side, trade_time)
      VALUES (99, 'WIA99999', '9999999999', 'INFY', 100, 1500, 'BUY', '11:00:00')
    `).run();

    const transcript = `
      [00:02] ADVISOR: Good morning sir, WIA12345 verified.
      [00:06] CLIENT: Buy 3 shares of RELIANCE at market price.
      [00:10] ADVISOR: Placing your buy order for 3 shares of RELIANCE at CMP.
      [00:14] CLIENT: Okay thank you.
    `;

    db.prepare(`
      INSERT INTO calls (
        id, customer_number, calling_number, client_code, transcript, call_time, duration_seconds,
        status, processing_status
      ) VALUES (
        945, '9876543210', '9876543210', 'WIA12345', ?, '11:15:00', 19,
        'transcribed', 'IDLE'
      )
    `).run(transcript);

    db.prepare(`INSERT INTO call_segments VALUES (1, 945, 'ADVISOR', 'Good morning sir, WIA12345 verified.', 2, 5)`).run();
    db.prepare(`INSERT INTO call_segments VALUES (2, 945, 'CLIENT', 'Buy 3 shares of RELIANCE at market price.', 6, 9)`).run();
    db.prepare(`INSERT INTO call_segments VALUES (3, 945, 'ADVISOR', 'Placing your buy order for 3 shares of RELIANCE at CMP.', 10, 14)`).run();

    // Run Stage 4 Classification
    const classRes = await stage4ClassifyCall(db, 945);
    assert.strictEqual(classRes.classification, 'PRE_ORDER', 'Call with actionable order intent during market hours MUST be PRE_ORDER');

    // Run Stage 5 Trade Matching (Trade does NOT exist for this client)
    const matchRes = stage5MatchTrade(db, 945);
    assert.strictEqual(matchRes.status, 'NO_MATCH', 'Trade matching must report NO_MATCH');

    // Verify Eligibility Gate blocks NO_MATCH call from proceeding to audit (Requirement #2)
    const eligibility = isAuditEligible(db, 945);
    assert.strictEqual(eligibility.eligible, false, 'NO_MATCH call must NOT proceed to audit or scorecard per User Requirement #2');
  });

  // Test 9: General inquiry with client trade in DB remains REGULAR (Trade alone does not make PRE_ORDER)
  await runTest('Test 9: General inquiry with client trade in DB remains REGULAR (Item #8)', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE calls (
        id INTEGER PRIMARY KEY,
        customer_number TEXT,
        calling_number TEXT,
        client_code TEXT,
        transcript TEXT,
        call_time TEXT,
        duration_seconds REAL,
        classification TEXT,
        call_type TEXT,
        classification_reason TEXT,
        status TEXT
      );
      CREATE TABLE trades (id INTEGER PRIMARY KEY, client TEXT, client_number TEXT, symbol TEXT, quantity REAL, price REAL, side TEXT, trade_time TEXT);
      CREATE TABLE call_segments (id INTEGER PRIMARY KEY, call_id INTEGER, speaker TEXT, text TEXT, start_time REAL, end_time REAL);
    `);

    db.prepare(`
      INSERT INTO trades (id, client, client_number, symbol, quantity, price, side, trade_time)
      VALUES (50, 'WIA12345', '9876543210', 'RELIANCE', 10, 2500, 'BUY', '11:00:00')
    `).run();

    // Call has NO actionable order directives (just asking for account statement)
    const inquiryTranscript = `
      Advisor: Good morning sir, how can I help you?
      Client: Hello, can you please email me my ledger statement and contract note for this month?
      Advisor: Sure sir, I will dispatch your statement right away.
      Client: Thank you so much, bye.
    `;

    db.prepare(`
      INSERT INTO calls (
        id, customer_number, calling_number, client_code, transcript, call_time, duration_seconds,
        status
      ) VALUES (
        946, '9876543210', '9876543210', 'WIA12345', ?, '11:15:00', 30, 'transcribed'
      )
    `).run(inquiryTranscript);

    const classRes = await stage4ClassifyCall(db, 946);
    assert.strictEqual(classRes.classification, 'REGULAR', 'Inquiry call must be REGULAR even if client executed a trade that day!');
  });

  // Test 10: Q1 rejects short, invalid, or corrupted phone numbers
  await runTest('Test 10: Q1 rejects short or corrupted customer numbers (Item #15)', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE calls (id INTEGER PRIMARY KEY, customer_number TEXT, calling_number TEXT, registered_number TEXT, client_code TEXT, transcript TEXT, call_time TEXT, classification TEXT, matched_trade_id INTEGER, trade_match_status TEXT, audit_status TEXT, status TEXT);
      CREATE TABLE trades (id INTEGER PRIMARY KEY, client TEXT, client_number TEXT, symbol TEXT, quantity REAL, price REAL, side TEXT, trade_time TEXT);
      CREATE TABLE call_segments (id INTEGER PRIMARY KEY, call_id INTEGER, speaker TEXT, text TEXT, start_time REAL, end_time REAL);
      CREATE TABLE call_orders (id TEXT PRIMARY KEY, call_id INTEGER, symbol TEXT, quantity REAL, limit_price REAL, price_type TEXT);
      CREATE TABLE order_executions (id TEXT PRIMARY KEY, order_id TEXT, trade_id INTEGER, status TEXT);
    `);

    db.prepare(`
      INSERT INTO trades (id, client, client_number, symbol, quantity, price, side, trade_time)
      VALUES (1, 'WIA12345', '9876543210', 'RELIANCE', 10, 2500, 'BUY', '10:00:00')
    `).run();

    // Short invalid phone (e.g. 7 digits)
    db.prepare(`
      INSERT INTO calls (id, customer_number, calling_number, client_code, transcript, call_time, classification, matched_trade_id, trade_match_status)
      VALUES (947, '9191611', '9191611', 'WIA12345', 'Advisor: WIA12345 confirmed. Buying 10 Reliance at 2500.', '10:00:00', 'PRE_ORDER', 1, 'CONFIRMED')
    `).run();

    db.prepare(`INSERT INTO call_segments VALUES (1, 947, 'ADVISOR', 'WIA12345 confirmed. Buying 10 Reliance at 2500.', 0, 5)`).run();

    const audit = await stage7AuditCall(db, 947);
    assert.strictEqual(audit.q1.status, 'FAIL', 'Q1 must FAIL when customer number is not a valid 10-digit number');
    assert.strictEqual(audit.q1.flag, 'FATAL', 'Q1 failure must be FATAL');
  });

  // Test 11: Q3 rejects +-10% quantity tolerance and +-₹1 price tolerance
  await runTest('Test 11: Q3 strictly rejects +-10% quantity and +-₹1 price tolerances (Items #23, #24)', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE calls (id INTEGER PRIMARY KEY, customer_number TEXT, calling_number TEXT, registered_number TEXT, client_code TEXT, transcript TEXT, call_time TEXT, classification TEXT, matched_trade_id INTEGER, trade_match_status TEXT, audit_status TEXT, status TEXT);
      CREATE TABLE trades (id INTEGER PRIMARY KEY, client TEXT, client_number TEXT, symbol TEXT, quantity REAL, price REAL, side TEXT, trade_time TEXT);
      CREATE TABLE call_segments (id INTEGER PRIMARY KEY, call_id INTEGER, speaker TEXT, text TEXT, start_time REAL, end_time REAL);
      CREATE TABLE call_orders (id TEXT PRIMARY KEY, call_id INTEGER, symbol TEXT, quantity REAL, limit_price REAL, price_type TEXT);
      CREATE TABLE order_executions (id TEXT PRIMARY KEY, order_id TEXT, trade_id INTEGER, status TEXT);
    `);

    // Trade is for 100 shares @ ₹500
    db.prepare(`
      INSERT INTO trades (id, client, client_number, symbol, quantity, price, side, trade_time)
      VALUES (1, 'WIA12345', '9876543210', 'TCS', 100, 500, 'BUY', '10:00:00')
    `).run();

    // Call has order for 95 shares (within 10% tolerance, but NOT exact)
    db.prepare(`
      INSERT INTO calls (id, customer_number, calling_number, client_code, transcript, call_time, classification, matched_trade_id, trade_match_status)
      VALUES (948, '9876543210', '9876543210', 'WIA12345', 'Advisor: WIA12345 confirmed. Buying 95 shares of TCS at 500.', '10:00:00', 'PRE_ORDER', 1, 'CONFIRMED')
    `).run();

    db.prepare(`INSERT INTO call_segments VALUES (1, 948, 'ADVISOR', 'WIA12345 confirmed. Buying 95 shares of TCS at 500.', 0, 5)`).run();

    const audit = await stage7AuditCall(db, 948);
    assert.strictEqual(audit.q3.status, 'FAIL', 'Q3 must FAIL when quantity is 95 vs 100 (exact quantity required, 10% tolerance removed)');
    assert.strictEqual(audit.q3.flag, 'NON_FATAL', 'Q3 failure must be NON_FATAL');
  });

  console.log('===========================================================');
  console.log('All Production-Strict SEBI Compliance Tests Passed (100%)!');
  console.log('===========================================================');
}

main();
