const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT 
    COUNT(*) as total_transcribed,
    SUM(CASE WHEN matched_trade_id > 0 THEN 1 ELSE 0 END) as with_trade_id,
    SUM(CASE WHEN trade_match_status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed_match,
    SUM(CASE WHEN audit_status = 'AUDITED' THEN 1 ELSE 0 END) as audited
  FROM calls
  WHERE transcript IS NOT NULL AND length(trim(transcript)) >= 15
`).get();

console.log('Transcribed calls trade match status:', rows);
