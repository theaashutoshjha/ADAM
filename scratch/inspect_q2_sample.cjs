const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

console.log('=== INSPECTING 5 CALLS THAT PASSED Q2 ===');
const passes = db.prepare(`
  SELECT s.call_id, s.client_code, s.q2_evidence, c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'PASS'
  LIMIT 5
`).all();

passes.forEach((p, i) => {
  console.log(`\n--- PASS [${i+1}] Call #${p.call_id} (Client: ${p.client_code}) ---`);
  console.log('Evidence:', p.q2_evidence);
  console.log('Transcript snippet:', p.transcript ? p.transcript.slice(0, 300) : 'EMPTY');
});

console.log('\n=== INSPECTING 5 CALLS THAT FAILED Q2 ===');
const fails = db.prepare(`
  SELECT s.call_id, s.client_code, s.q2_evidence, c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL' AND s.fatal_reasons NOT LIKE '%SCRAP_CALL%'
  LIMIT 5
`).all();

fails.forEach((f, i) => {
  console.log(`\n--- FAIL [${i+1}] Call #${f.call_id} (Client: ${f.client_code}) ---`);
  console.log('Evidence:', f.q2_evidence);
  console.log('Transcript snippet:', f.transcript ? f.transcript.slice(0, 300) : 'EMPTY');
});
