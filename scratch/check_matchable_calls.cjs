const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const res = db.prepare(`
  SELECT 
    COUNT(DISTINCT c.id) as calls_matching_trades,
    COUNT(DISTINCT t.id) as trades_matching_calls
  FROM calls c
  JOIN trades t ON (
    c.calling_number = t.phone_number 
    OR c.calling_number = t.client_number
    OR (length(c.client_code) > 3 AND c.client_code = t.client)
  )
`).get();

console.log('Calls matching trades by phone or client code:', res);

const currentlyMatched = db.prepare(`
  SELECT COUNT(*) as count FROM calls WHERE matched_trade_id > 0
`).get().count;

console.log('Currently calls with matched_trade_id > 0:', currentlyMatched);

const preOrderCount = db.prepare(`
  SELECT COUNT(*) as count FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).get().count;
console.log('Current calls marked PRE_ORDER:', preOrderCount);
