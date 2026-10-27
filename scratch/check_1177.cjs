const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const auditCallIds = db.prepare('SELECT DISTINCT call_id FROM audits ORDER BY call_id ASC').all().map(r => r.call_id);
console.log('Distinct call_ids in audits:', auditCallIds.length);

const scorecardCallIds = db.prepare('SELECT DISTINCT call_id FROM scorecards ORDER BY call_id ASC').all().map(r => r.call_id);
console.log('Distinct call_ids in scorecards:', scorecardCallIds.length);

const callStats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN transcript_model = 'deepgram-nova-3' THEN 1 ELSE 0 END) as deepgram_count,
    SUM(CASE WHEN transcript_model != 'deepgram-nova-3' OR transcript_model IS NULL THEN 1 ELSE 0 END) as other_model_count,
    SUM(CASE WHEN storage_path IS NOT NULL THEN 1 ELSE 0 END) as has_storage_path,
    SUM(CASE WHEN matched_trade_id IS NOT NULL THEN 1 ELSE 0 END) as has_matched_trade_id
  FROM calls
  WHERE id IN (SELECT DISTINCT call_id FROM audits)
`).get();
console.log('Call stats for the 1177 audited calls:', callStats);

const otherModels = db.prepare(`
  SELECT transcript_model, count(*) as count
  FROM calls
  WHERE id IN (SELECT DISTINCT call_id FROM audits)
  GROUP BY transcript_model
`).all();
console.log('Transcript models among the 1177 audited calls:', otherModels);

const tradeLinkStats = db.prepare(`
  SELECT 
    COUNT(*) as total_trades,
    SUM(CASE WHEN matched_call_id IS NOT NULL THEN 1 ELSE 0 END) as matched_trades,
    SUM(CASE WHEN matched_call_id IN (SELECT DISTINCT call_id FROM audits) THEN 1 ELSE 0 END) as matched_to_1177
  FROM trades
`).get();
console.log('Trade linking stats:', tradeLinkStats);
