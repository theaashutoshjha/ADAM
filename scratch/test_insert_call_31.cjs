const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

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

try {
  const auditRes = insertAuditStmt.run(
    31, 580,
    'PASS', null, 'Registered number matched', 1.0, 'ADVISOR',
    'FAIL', 'FATAL', 'Silence detected', 1.0, 'ADVISOR',
    'FAIL', null, 'Order params missing', 0.95, 'ADVISOR',
    'FAIL', null, 'No affirmative consent', 1.0, 'CLIENT',
    'PASS', null, 'Compliant', 1.0, 'ADVISOR',
    2, 'FATAL: Silence / missing details', 'FATAL_VIOLATION', now, now
  );
  console.log('auditRes:', auditRes.lastInsertRowid);
  const scRes = insertScorecardStmt.run(
    Number(auditRes.lastInsertRowid),
    31, 'Sai Deekshith GN', 'W2898', 'Equity', 'PWA03264', 'PWA03264', 580,
    '9686410304', '9686410304', '9686410304', '2026-10-07', '2026-10-07',
    2, 1, 'Fatal: Client ID missing',
    'PASS', 'Registered match',
    'FAIL', 'Missing client ID',
    'FAIL', 'Missing params',
    'FAIL', 'Missing ack',
    'PASS', 'Compliant',
    'FATAL: Client ID missing',
    now, now, now
  );
  console.log('insertScorecardStmt succeeded, lastInsertRowid:', scRes.lastInsertRowid);
} catch (err) {
  console.error('Error inserting:', err);
}
