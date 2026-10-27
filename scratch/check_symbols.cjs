const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const syms = db.prepare(`
  SELECT t.symbol, count(*) as count 
  FROM calls c 
  JOIN trades t ON c.matched_trade_id = t.id 
  WHERE c.classification = 'PRE_ORDER' OR c.call_type = 'pre_order'
  GROUP BY t.symbol
  ORDER BY count DESC
  LIMIT 25
`).all();
console.log('Top symbols for pre-order trades:', syms);
