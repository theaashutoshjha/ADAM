const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

console.log('=== CHECKING CALLS TABLE TRANSCRIPT AND AUDIT STATUSES ===');
const callTranscriptStatuses = db.prepare(`
  SELECT transcript_status, audit_status, count(*) as count
  FROM calls
  GROUP BY transcript_status, audit_status
`).all();
console.log('All calls (4096) transcript & audit status:', callTranscriptStatuses);

const preOrderStatuses = db.prepare(`
  SELECT transcript_status, audit_status, count(*) as count
  FROM calls
  WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL
  GROUP BY transcript_status, audit_status
`).all();
console.log('Pre-order calls (1033) transcript & audit status:', preOrderStatuses);

console.log('\n=== CHECKING WHAT CALLS ARE MISSING TRANSCRIPTS OR AUDITS ===');
const missingTranscript = db.prepare(`
  SELECT id, call_type, classification, transcript_status, audit_status, substr(transcript, 1, 50) as snippet
  FROM calls
  WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL)
    AND (transcript IS NULL OR length(trim(transcript)) = 0 OR transcript_status != 'COMPLETED')
`).all();
console.log('Pre-order calls missing completed transcript:', missingTranscript.length);

const missingAudit = db.prepare(`
  SELECT id, call_type, classification, transcript_status, audit_status
  FROM calls
  WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL)
    AND (audit_status != 'COMPLETED' OR audit_status IS NULL)
`).all();
console.log('Pre-order calls with audit_status != COMPLETED in calls table:', missingAudit.length);
if (missingAudit.length > 0) {
  console.log('Sample missing audit calls in calls table:', missingAudit.slice(0, 10));
}
