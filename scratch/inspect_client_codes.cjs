const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const clientCodes = db.prepare(`
  SELECT client_code, count(*) as call_count
  FROM calls
  WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL
  GROUP BY client_code
  ORDER BY call_count DESC
`).all();

console.log('Total distinct client codes across 1,033 calls:', clientCodes.length);
console.log('Top 20 client codes:', clientCodes.slice(0, 20));

// Check what prefixes exist
const prefixes = {};
for (const c of clientCodes) {
  if (c.client_code) {
    const pref = c.client_code.slice(0, 3);
    prefixes[pref] = (prefixes[pref] || 0) + c.call_count;
  }
}
console.log('Client code prefix distribution across 1033 calls:', prefixes);
