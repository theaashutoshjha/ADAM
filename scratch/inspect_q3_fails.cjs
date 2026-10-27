const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const fails = db.prepare(`
  SELECT sc.call_id, sc.q3_status, sc.q3_evidence, c.transcript, c.client_code, t.symbol, t.quantity, t.price
  FROM scorecards sc
  JOIN calls c ON sc.call_id = c.id
  LEFT JOIN trades t ON sc.resolved_trade_id = t.id
  WHERE sc.q3_status = 'FAIL'
  LIMIT 15
`).all();

console.log('Sample Q3 fails:');
for (const f of fails) {
  console.log(`\n--- Call #${f.call_id} (Client: ${f.client_code}, Trade: ${f.symbol}, Qty: ${f.quantity}, Price: ${f.price}) ---`);
  console.log(`Evidence: ${f.q3_evidence}`);
  console.log(`Transcript: ${f.transcript?.slice(0, 200)}`);
}
