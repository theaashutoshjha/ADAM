const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, s.q2_evidence, c.transcript, c.call_time, c.duration_seconds
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL'
  LIMIT 20
`).all();

console.log('Inspecting 20 remaining Q2 Failures:');
rows.forEach((r, idx) => {
  console.log(`\n[${idx + 1}] Call #${r.call_id} [UCC: ${r.client_code}, Dur: ${r.duration_seconds}s]:`);
  console.log((r.transcript || '').slice(0, 200).replace(/\n/g, ' '));
});
