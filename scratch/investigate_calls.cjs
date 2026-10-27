const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Let's inspect the 12 calls pending transcript
const pendingCalls = db.prepare(`
  SELECT id, storage_path, duration_seconds, call_type, classification, client_code
  FROM calls 
  WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL)
    AND (transcript IS NULL OR length(trim(transcript)) = 0)
`).all();
console.log('12 Calls pending transcript:', pendingCalls);

// Let's inspect how trade matching connects calls and trades
const trades = db.prepare(`SELECT count(*) as c FROM trades`).get().c;
console.log('Total trades:', trades);

// Let's check how many trades matched pre-order calls
const matchedTrades = db.prepare(`SELECT count(DISTINCT matched_trade_id) as c FROM calls WHERE matched_trade_id IS NOT NULL`).get().c;
console.log('Unique matched trades in calls table:', matchedTrades);

// Let's check calls table for pre_order vs trade matching
const preOrderCheck = db.prepare(`
  SELECT 
    sum(case when call_type = 'pre_order' then 1 else 0 end) as type_pre,
    sum(case when classification = 'PRE_ORDER' then 1 else 0 end) as class_pre,
    sum(case when matched_trade_id IS NOT NULL then 1 else 0 end) as matched_trade_pre
  FROM calls
`).get();
console.log('Pre order flags:', preOrderCheck);
