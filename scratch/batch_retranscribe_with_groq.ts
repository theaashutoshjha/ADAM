import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

import { transcribeWithGroqWhisper } from '../server/groq-transcriber';
import { resolveAuthoritativeUcc } from '../server/pipeline/criticalEntityResolver';
import { stage7AuditCall } from '../server/pipeline/audit';
import { calculateAuthoritativeScore } from '../server/scoring-engine';

interface TargetCall {
  id: number;
  client_code: string;
  storage_path: string;
  duration_seconds: number;
  transcript: string;
}

// Select substantive calls that failed Q2 and have audio on disk
const candidates = db.prepare(`
  SELECT c.id, c.client_code, c.storage_path, c.duration_seconds, c.transcript
  FROM calls c
  JOIN audits a ON c.id = a.call_id
  WHERE a.q2 = 'FAIL'
    AND c.storage_path IS NOT NULL
    AND c.duration_seconds >= 20
    AND (c.transcript IS NULL OR length(c.transcript) < 400 OR c.transcript LIKE '%...%' OR c.transcript LIKE '%Plain%')
    AND c.transcript NOT LIKE '%voicemail%'
    AND c.transcript NOT LIKE '%Silence%'
  ORDER BY c.duration_seconds DESC, c.id ASC
`).all() as TargetCall[];

console.log(`Found ${candidates.length} candidate calls needing full Groq Whisper re-transcription.`);

const updateCallStmt = db.prepare(`
  UPDATE calls 
  SET transcript = ?,
      updated_at = datetime('now')
  WHERE id = ?
`);

const deleteSegmentsStmt = db.prepare(`DELETE FROM call_segments WHERE call_id = ?`);
const insertSegmentStmt = db.prepare(`
  INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);

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

async function runBatch(batchSize: number = 50) {
  const batch = candidates.slice(0, batchSize);
  console.log(`Processing batch of ${batch.length} calls with Groq Whisper Large v3...`);

  let newlyPassed = 0;
  let processed = 0;

  for (const call of batch) {
    if (!fs.existsSync(call.storage_path)) {
      console.log(`Skipping Call #${call.id}: audio file not found`);
      continue;
    }

    try {
      const res = await transcribeWithGroqWhisper(call.storage_path, process.env.GROQ_API_KEY!, {
        candidateClientCodes: [call.client_code],
      });

      // Update call transcript and segments in DB
      db.exec('BEGIN TRANSACTION;');
      updateCallStmt.run(res.transcript, call.id);
      deleteSegmentsStmt.run(call.id);

      for (let i = 0; i < (res.segments || []).length; i++) {
        const seg = res.segments[i];
        insertSegmentStmt.run(
          call.id,
          `seg_${call.id}_${i + 1}`,
          seg.start_time ?? 0,
          seg.end_time ?? 0,
          seg.speaker || 'ADVISOR',
          seg.text || ''
        );
      }

      // Re-audit call with updated full transcript
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

      db.exec('COMMIT;');
      processed++;

      const isPass = q2.status === 'PASS';
      if (isPass) newlyPassed++;

      console.log(`[${processed}/${batch.length}] Call #${call.id} [${call.client_code}]: Q2 -> ${isPass ? '✅ PASS' : '❌ FAIL'}`);
      
      // Throttle: 300ms pause between requests to respect rate limits
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      try { db.exec('ROLLBACK;'); } catch {}
      console.error(`Error on Call #${call.id}:`, err?.message);
      if (err?.message?.includes('rate_limit') || err?.message?.includes('429')) {
        console.log('Rate limit reached. Sleeping 30s before retry...');
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  console.log(`\n================ BATCH COMPLETED ================`);
  console.log(`Processed: ${processed} calls`);
  console.log(`Newly Passed Q2: ${newlyPassed}`);

  const totalStats = db.prepare(`
    SELECT 
      count(*) as total,
      sum(case when q2_status = 'PASS' then 1 else 0 end) as q2_pass,
      sum(case when q2_status = 'FAIL' then 1 else 0 end) as q2_fail,
      sum(case when score = 5 then 1 else 0 end) as s5,
      sum(case when score = 4 then 1 else 0 end) as s4,
      sum(is_fatal) as fatal
    FROM scorecards
  `).get();
  console.log('Updated Total Scorecards State in Database:', totalStats);
}

runBatch(50).catch(console.error);
