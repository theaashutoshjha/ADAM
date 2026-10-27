const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const totalSc = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
const totalAudits = db.prepare('SELECT count(*) as c FROM audits').get().c;
console.log(`Total Scorecards: ${totalSc}, Total Audits: ${totalAudits}`);

const unmatched = db.prepare(`
  SELECT count(*) as c 
  FROM scorecards s
  LEFT JOIN audits a ON s.audit_id = a.id
  WHERE s.q2_status != a.q2 OR s.score != a.score
`).get().c;
console.log(`Mismatches between scorecards and audits: ${unmatched}`);

// Sample verified passes
console.log('\n=== SAMPLE VERIFIED Q2 PASSES (SHOWING EXACT CLIENT ID MATCH) ===');
const samplePasses = db.prepare(`
  SELECT call_id, client_code, q2_status, q2_evidence, score
  FROM scorecards
  WHERE q2_status = 'PASS'
  LIMIT 5
`).all();
samplePasses.forEach(p => {
  console.log(`Call #${p.call_id} [${p.client_code}] (Score: ${p.score}/5):`);
  console.log(`   ${p.q2_evidence}`);
});

// Sample verified fails
console.log('\n=== SAMPLE VERIFIED Q2 FAILS (GENUINELY MISSING CLIENT ID) ===');
const sampleFails = db.prepare(`
  SELECT s.call_id, s.client_code, s.q2_status, s.q2_evidence, s.score, c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL' AND s.fatal_reasons NOT LIKE '%SCRAP_CALL%'
  LIMIT 5
`).all();
sampleFails.forEach(f => {
  console.log(`Call #${f.call_id} [${f.client_code}] (Score: ${f.score}/5):`);
  console.log(`   Evidence: ${f.q2_evidence}`);
  console.log(`   Transcript snippet: ${f.transcript.slice(0, 150).replace(/\n/g, ' ')}`);
});
