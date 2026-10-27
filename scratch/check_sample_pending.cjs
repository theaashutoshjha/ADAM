const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const sample = db.prepare(`
  SELECT id, caller_id, client_code, calling_number, matched_trade_id, trade_match_status, identity_status
  FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND status = 'pending'
  LIMIT 5
`).all();

console.log('Sample pending calls:', sample);
