const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
const row = db.prepare("SELECT id, caller_id, status, audit_status, pipeline_stage, matched_trade_id, length(transcript) as tlen, storage_path, recording_url FROM calls WHERE caller_id LIKE '%1792055532%' OR recording_name LIKE '%1792055532%'").get();
console.log('Call row:', row);
if (row) {
  const sc = db.prepare("SELECT * FROM scorecards WHERE call_id = ?").all(row.id);
  console.log('Scorecards:', sc);
}
