const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const callers = [
  'HYD12-T10-17913562',
  'HYD15-D13-17915176',
  'HYD12-T10-17919527',
  'HYD19-T12-17914444',
  'HYD15-T5-179144287',
  'HYD12-T10-17918637',
  'HYD18-T13-17908482',
  'HYD12-T10-17912666',
  'HYD18-T6-179213268',
  'HYD18-T4-179213700'
];

for (const c of callers) {
  const row = db.prepare(`
    SELECT id, caller_id, status, audit_status, storage_path, recording_url, 
           length(transcript) as tlen, matched_trade_id, trade_match_status
    FROM calls 
    WHERE caller_id LIKE ? OR recording_name LIKE ?
  `).get(`%${c}%`, `%${c}%`);
  console.log(c, row);
}
