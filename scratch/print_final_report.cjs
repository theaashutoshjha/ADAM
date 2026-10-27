const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const totalScorecards = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
const totalAudits = db.prepare('SELECT count(*) as c FROM audits').get().c;
const totalCalls = db.prepare('SELECT count(*) as c FROM calls').get().c;
const preOrderCalls = db.prepare("SELECT count(*) as c FROM calls WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL").get().c;

const stats = db.prepare(`
  SELECT 
    count(*) as total,
    sum(case when q1_status = 'PASS' then 1 else 0 end) as q1_pass,
    sum(case when q1_status = 'FAIL' then 1 else 0 end) as q1_fail,
    sum(case when q2_status = 'PASS' then 1 else 0 end) as q2_pass,
    sum(case when q2_status = 'FAIL' then 1 else 0 end) as q2_fail,
    sum(case when q3_status = 'PASS' then 1 else 0 end) as q3_pass,
    sum(case when q3_status = 'FAIL' then 1 else 0 end) as q3_fail,
    sum(case when q4_status = 'PASS' then 1 else 0 end) as q4_pass,
    sum(case when q5_status = 'PASS' then 1 else 0 end) as q5_pass,
    sum(case when score = 5 then 1 else 0 end) as s5,
    sum(case when score = 4 then 1 else 0 end) as s4,
    sum(case when score = 3 then 1 else 0 end) as s3,
    sum(case when score = 0 then 1 else 0 end) as s0,
    sum(is_fatal) as fatal,
    sum(case when fatal_reasons LIKE '%SCRAP_CALL%' THEN 1 ELSE 0 END) as scraps
  FROM scorecards
`).get();

console.log('=== SEBI AUDIT REPORT SUMMARY ===');
console.log('Total Pre-Order Calls Identified:', preOrderCalls);
console.log('Total Scorecards Audited:', stats.total);
console.log('Scrap Calls (under 10s / voicemail / dead line):', stats.scraps);
console.log('Q1 Customer Number Passes:', stats.q1_pass, `(${((stats.q1_pass / stats.total) * 100).toFixed(1)}%)`);
console.log('Q2 Spoken Client Code (UCC) Passes:', stats.q2_pass, `(${((stats.q2_pass / stats.total) * 100).toFixed(1)}%)`);
console.log('Q2 Client Code Fails:', stats.q2_fail);
console.log('Q3 Order Parameters (Scrip, Qty, Price) Passes:', stats.q3_pass, `(${((stats.q3_pass / stats.total) * 100).toFixed(1)}%)`);
console.log('Q4 Verbal Acknowledgement Passes:', stats.q4_pass, `(${((stats.q4_pass / stats.total) * 100).toFixed(1)}%)`);
console.log('Q5 No Assurance / Return Guarantee Passes:', stats.q5_pass, `(${((stats.q5_pass / stats.total) * 100).toFixed(1)}%)`);
console.log('Fully Compliant (Score 5/5):', stats.s5);
console.log('Compliant (Score 4/5):', stats.s4);
console.log('Review Required (Score 3/5):', stats.s3);
console.log('Non-Compliant / Fatal (Score 0/5):', stats.s0);
console.log('Total Fatal Marked:', stats.fatal);

// 10 Sample verified Q2 Passes with exact Client ID and Dialogue Evidence
console.log('\n=== TOP 10 VERIFIED Q2 (CLIENT CODE) SPOKEN PASSES ===');
const samplePass = db.prepare(`
  SELECT call_id, client_code, q2_status, q2_evidence
  FROM scorecards
  WHERE q2_status = 'PASS'
  LIMIT 10
`).all();
samplePass.forEach((r, idx) => {
  console.log(`[${idx + 1}] Call #${r.call_id} | Client ID: ${r.client_code}`);
  console.log(`    Evidence: ${r.q2_evidence}`);
});

// 5 Sample verified Q2 Fails (where advisor never spoke the client code)
console.log('\n=== SAMPLE VERIFIED Q2 (CLIENT CODE) FAILS (NO SPOKEN UCC IN CALL) ===');
const sampleFail = db.prepare(`
  SELECT call_id, client_code, q2_status, q2_evidence
  FROM scorecards
  WHERE q2_status = 'FAIL' AND (fatal_reasons NOT LIKE '%SCRAP_CALL%' OR fatal_reasons IS NULL)
  LIMIT 5
`).all();
sampleFail.forEach((r, idx) => {
  console.log(`[${idx + 1}] Call #${r.call_id} | Expected Client ID: ${r.client_code}`);
  console.log(`    Evidence: ${r.q2_evidence}`);
});
