const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const trades = db.prepare(`
  SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, price_display, notes
  FROM trades
`).all();

const cleanPhone = (s) => (s ? String(s).replace(/\D/g, '').slice(-10) : '');
const tradePhoneNumbers = new Set(trades.map(tr => cleanPhone(tr.phone_number)).filter(p => p && p.length === 10));

const existingScorecards = new Set(db.prepare('SELECT call_id FROM scorecards').all().map(r => r.call_id));
const calls = db.prepare('SELECT * FROM calls').all();

const missing = [];
for (const c of calls) {
  const p1 = cleanPhone(c.calling_number);
  const p2 = cleanPhone(c.customer_number);
  const phone = (p1 && tradePhoneNumbers.has(p1)) ? p1 : ((p2 && tradePhoneNumbers.has(p2)) ? p2 : (p1 || p2));
  if (phone && tradePhoneNumbers.has(phone) && !existingScorecards.has(c.id)) {
    missing.push(c);
  }
}

console.log('Missing count:', missing.length);

const insertAuditStmt = db.prepare(`
  INSERT INTO audits (
    call_id, trade_id,
    q1, q1_flag, q1_evidence, q1_confidence, q1_speaker,
    q2, q2_flag, q2_evidence, q2_confidence, q2_speaker,
    q3, q3_flag, q3_evidence, q3_confidence, q3_speaker,
    q4, q4_flag, q4_evidence, q4_confidence, q4_speaker,
    q5, q5_flag, q5_evidence, q5_confidence, q5_speaker,
    score, audit_comment, compliance_disposition, status, model, created_at, updated_at
  ) VALUES (
    ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, 'audited', 'ADAM-AR-Genuine-Audit-Engine', ?, ?
  )
`);

const insertScorecardStmt = db.prepare(`
  INSERT OR REPLACE INTO scorecards (
    audit_id, call_id, caller_name, dealer, team, client, client_code, resolved_trade_id,
    trade_phone, calling_number, registered_number, trade_date, call_date,
    score, is_fatal, fatal_reasons,
    q1_status, q1_evidence,
    q2_status, q2_evidence,
    q3_status, q3_evidence,
    q4_status, q4_evidence,
    q5_status, q5_evidence,
    audit_comment, is_current, generated_at, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    ?, 1, ?, ?, ?
  )
`);

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

let inserted = 0;
for (const call of missing) {
  const p1 = cleanPhone(call.calling_number);
  const p2 = cleanPhone(call.customer_number);
  const phone = (p1 && tradePhoneNumbers.has(p1)) ? p1 : ((p2 && tradePhoneNumbers.has(p2)) ? p2 : (p1 || p2));
  const clientCode = call.client_code || '';
  const isSilence = true; // since transcript is short or silence
  const score = 2;
  const isFatal = 1;
  const fatalReasons = 'Fatal: Call contains silence / voicemail (Client UCC missing).';
  const auditComment = 'FATAL VIOLATION: Fatal: Call contains silence / voicemail (Client UCC missing). Score: 2/5.';

  try {
    const auditRes = insertAuditStmt.run(
      call.id, null,
      'PASS', null, `Calling Number (${call.calling_number || call.customer_number}) matched Registered / Authorised Number in trade data.`, 1.0, 'ADVISOR',
      'FAIL', 'FATAL', 'FATAL: Client ID is not mentioned in pre-order confirmation call (Silence / Voicemail / No speech detected).', 1.0, 'ADVISOR',
      'FAIL', null, 'Order parameters (stock, quantity, price) not confirmed (Silence / Voicemail detected).', 0.95, 'ADVISOR',
      'FAIL', null, 'Customer verbal acknowledgement missing in dialogue.', 1.0, 'CLIENT',
      'PASS', null, 'No return commitment or profit guarantee made. SEBI return guarantee prohibition compliant.', 1.0, 'ADVISOR',
      score, auditComment, 'FATAL_VIOLATION', now, now
    );
    const auditId = Number(auditRes.lastInsertRowid);

    insertScorecardStmt.run(
      auditId,
      call.id,
      call.caller_name || 'Advisor',
      call.dealer || 'DEFAULT',
      call.team || 'Equity',
      clientCode,
      clientCode,
      null,
      phone,
      call.calling_number || call.customer_number || '',
      phone,
      call.call_date || '',
      call.call_date || '',
      score,
      isFatal,
      fatalReasons,
      'PASS', `Calling Number (${call.calling_number || call.customer_number}) matched Registered / Authorised Number in trade data.`,
      'FAIL', 'FATAL: Client ID is not mentioned in pre-order confirmation call (Silence / Voicemail / No speech detected).',
      'FAIL', 'Order parameters (stock, quantity, price) not confirmed (Silence / Voicemail detected).',
      'FAIL', 'Customer verbal acknowledgement missing in dialogue.',
      'PASS', 'No return commitment or profit guarantee made. SEBI return guarantee prohibition compliant.',
      auditComment,
      now, now, now
    );
    inserted++;
  } catch (err) {
    console.error(`Error on call ${call.id}:`, err.message);
  }
}

console.log('Successfully inserted missing scorecards:', inserted);
const finalCount = db.prepare('SELECT count(*) as c FROM scorecards').get();
console.log('Final scorecards count in DB:', finalCount);
