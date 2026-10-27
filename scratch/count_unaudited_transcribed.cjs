const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const unauditedWithTranscripts = db.prepare(`
  SELECT id, caller_id, calling_number, client_code, call_date, call_time, matched_trade_id, trade_match_status, length(transcript) as tlen
  FROM calls
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND transcript IS NOT NULL AND length(trim(transcript)) >= 15
    AND audit_status != 'AUDITED'
`).all();

console.log('Pre-order calls with transcripts that are NOT audited:', unauditedWithTranscripts.length);
console.log('Sample:', unauditedWithTranscripts.slice(0, 10));
