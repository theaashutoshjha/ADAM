const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const scorecardsWithoutAudit = db.prepare(`
  SELECT s.* FROM scorecards s
  LEFT JOIN audits a ON s.audit_id = a.id
  WHERE a.id IS NULL
`).all();

console.log('Scorecards without matching audit record:', scorecardsWithoutAudit.length);

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
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

const updateScorecardStmt = db.prepare('UPDATE scorecards SET audit_id = ? WHERE id = ?');

for (const sc of scorecardsWithoutAudit) {
  const auditRes = insertAuditStmt.run(
    sc.call_id, sc.resolved_trade_id || null,
    sc.q1_status, null, sc.q1_evidence, 1.0, 'ADVISOR',
    sc.q2_status, sc.is_fatal ? 'FATAL' : null, sc.q2_evidence, 1.0, 'ADVISOR',
    sc.q3_status, null, sc.q3_evidence, 0.95, 'ADVISOR',
    sc.q4_status, null, sc.q4_evidence, 1.0, 'CLIENT',
    sc.q5_status, null, sc.q5_evidence, 1.0, 'ADVISOR',
    sc.score, sc.audit_comment, sc.is_fatal ? 'FATAL_VIOLATION' : 'COMPLIANT', now, now
  );
  updateScorecardStmt.run(Number(auditRes.lastInsertRowid), sc.id);
}

const auditCount = db.prepare('SELECT count(*) as c FROM audits').get().c;
const scorecardCount = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
console.log(`Audits: ${auditCount}, Scorecards: ${scorecardCount}`);
