const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT id, client_code, transcript, duration_seconds, calling_number
  FROM calls
  WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL)
    AND transcript NOT LIKE '%WIA%'
    AND transcript NOT LIKE '%WID%'
    AND transcript NOT LIKE '%WIG%'
    AND transcript NOT LIKE '%PWA%'
    AND transcript NOT LIKE '%PWD%'
    AND transcript NOT LIKE '%WIC%'
    AND transcript NOT LIKE '%WIF%'
    AND transcript NOT LIKE '%[Silence%'
    AND transcript NOT LIKE '%voicemail%'
  LIMIT 25
`).all();

console.log(`Inspecting 25 non-matching calls:`);
calls.forEach((c, i) => {
  console.log(`\n[${i+1}] Call #${c.id} [${c.client_code}, Dur: ${c.duration_seconds}s, Phone: ${c.calling_number}]:`);
  console.log(`"${(c.transcript || '').replace(/\n/g, ' ')}"`);
});
