const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, c.transcript, c.call_time, c.duration_seconds
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL'
  LIMIT 25
`).all();

console.log('Inspecting 25 of the 174 Q2 Failures:');
rows.forEach((r, idx) => {
  console.log(`\n[${idx + 1}] Call #${r.call_id} [Code: ${r.client_code}, Time: ${r.call_time}]:`);
  console.log((r.transcript || '').slice(0, 250));
});
