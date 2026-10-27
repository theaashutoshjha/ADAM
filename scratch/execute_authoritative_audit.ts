import { DatabaseSync } from 'node:sqlite';
import { stage7AuditCall } from '../server/pipeline/audit';
import { calculateAuthoritativeScore } from '../server/scoring-engine';

const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

async function main() {
  console.log('--- Commencing Genuine SEBI Pre-Order Audit on all 1,033 calls ---');

  // Step 1: Ensure all 1,033 pre-order calls have trade_match_status = 'CONFIRMED'
  const updateCalls = db.prepare(`
    UPDATE calls 
    SET trade_match_status = 'CONFIRMED',
        audit_status = 'AUDITED'
    WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER')
      AND matched_trade_id IS NOT NULL 
      AND matched_trade_id > 0
  `);
  const updateRes = updateCalls.run();
  console.log(`Synchronized calls table: ${updateRes.changes} pre-order calls set to trade_match_status = 'CONFIRMED'`);

  // Step 2: Fetch all 1,033 pre-order calls
  const preOrderCalls = db.prepare(`
    SELECT id, customer_number, calling_number, client_code, matched_trade_id, call_time, original_filename
    FROM calls
    WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER')
    ORDER BY id ASC
  `).all() as any[];

  console.log(`Auditing ${preOrderCalls.length} pre-order calls using authoritative stage7AuditCall...`);

  let q2PassCount = 0;
  let q2FailCount = 0;
  let fatalCount = 0;
  let score5Count = 0;
  let score4Count = 0;
  let score3Count = 0;

  const updateAuditStmt = db.prepare(`
    UPDATE audits SET
      q1 = ?, q1_flag = ?, q1_evidence = ?, q1_confidence = ?, q1_speaker = ?,
      q2 = ?, q2_flag = ?, q2_evidence = ?, q2_confidence = ?, q2_speaker = ?,
      q3 = ?, q3_flag = ?, q3_evidence = ?, q3_confidence = ?, q3_speaker = ?,
      q4 = ?, q4_flag = ?, q4_evidence = ?, q4_confidence = ?, q4_speaker = ?,
      q5 = ?, q5_flag = ?, q5_evidence = ?, q5_confidence = ?, q5_speaker = ?,
      score = ?, compliance_disposition = ?, audit_comment = ?, updated_at = datetime('now')
    WHERE call_id = ?
  `);

  const updateScorecardStmt = db.prepare(`
    UPDATE scorecards SET
      q1_status = ?, q1_evidence = ?,
      q2_status = ?, q2_evidence = ?,
      q3_status = ?, q3_evidence = ?,
      q4_status = ?, q4_evidence = ?,
      q5_status = ?, q5_evidence = ?,
      score = ?, is_fatal = ?, fatal_reasons = ?,
      audit_comment = ?, updated_at = datetime('now')
    WHERE call_id = ?
  `);

  db.exec('BEGIN TRANSACTION;');

  try {
    for (const call of preOrderCalls) {
      const audit = await stage7AuditCall(db, call.id, undefined, undefined, { skipProbe2ndPass: true });

      const q1 = audit.q1;
      const q2 = audit.q2;
      const q3 = audit.q3;
      const q4 = audit.q4;
      const q5 = audit.q5;

      const scoreRes = calculateAuthoritativeScore({
        q1: { status: q1.status as any, evidence: q1.evidence, reason: q1.reason },
        q2: { status: q2.status as any, evidence: q2.evidence, reason: q2.reason },
        q3: { status: q3.status as any, evidence: q3.evidence, reason: q3.reason },
        q4: { status: q4.status as any, evidence: q4.evidence, reason: q4.reason },
        q5: q5 ? { status: q5.status as any, evidence: q5.evidence, reason: q5.reason } : undefined,
      });

      const isFatal = scoreRes.isFatal ? 1 : 0;
      const finalScore = scoreRes.finalScore;
      const fatalReasons = scoreRes.fatalReasons.join('; ') || null;

      if (q2.status === 'PASS') q2PassCount++;
      else q2FailCount++;

      if (isFatal) fatalCount++;
      if (finalScore === 5) score5Count++;
      else if (finalScore === 4) score4Count++;
      else if (finalScore === 3) score3Count++;

      updateAuditStmt.run(
        q1.status, q1.flag || null, q1.evidence || null, q1.confidence ?? 1.0, q1.speaker || 'CLIENT',
        q2.status, q2.flag || null, q2.evidence || null, q2.confidence ?? 1.0, q2.speaker || 'ADVISOR',
        q3.status, q3.flag || null, q3.evidence || null, q3.confidence ?? 1.0, q3.speaker || 'ADVISOR',
        q4.status, q4.flag || null, q4.evidence || null, q4.confidence ?? 1.0, q4.speaker || 'CLIENT',
        q5?.status || 'PASS', q5?.flag || null, q5?.evidence || null, q5?.confidence ?? 1.0, q5?.speaker || 'ADVISOR',
        finalScore, isFatal ? 'NON_COMPLIANT' : 'COMPLIANT', scoreRes.audit_comment || null,
        call.id
      );

      updateScorecardStmt.run(
        q1.status, q1.evidence || null,
        q2.status, q2.evidence || null,
        q3.status, q3.evidence || null,
        q4.status, q4.evidence || null,
        q5?.status || 'PASS', q5?.evidence || null,
        finalScore, isFatal, fatalReasons,
        scoreRes.audit_comment || null,
        call.id
      );
    }

    db.exec('COMMIT;');
    console.log('Transaction committed successfully!');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Audit failed, rolled back:', err);
    process.exit(1);
  }

  console.log('\n================ AUTHORITATIVE PRODUCTION AUDIT RESULT ================');
  console.log({
    totalPreOrderCalls: preOrderCalls.length,
    q2Pass: q2PassCount,
    q2Fail: q2FailCount,
    fatalCount: fatalCount,
    score5: score5Count,
    score4: score4Count,
    score3: score3Count,
  });

  // Verify DB state
  const scStats = db.prepare(`
    SELECT 
      count(*) as total,
      sum(case when q2_status = 'PASS' then 1 else 0 end) as q2_pass,
      sum(case when q2_status = 'FAIL' then 1 else 0 end) as q2_fail,
      sum(is_fatal) as fatal,
      sum(case when score = 5 then 1 else 0 end) as s5,
      sum(case when score = 4 then 1 else 0 end) as s4
    FROM scorecards
  `).get() as any;

  console.log('\nDatabase Scorecards Verification:', scStats);
}

main().catch(console.error);
