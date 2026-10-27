const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Purge any older orphaned audits not linked to the authoritative scorecards
const beforeCount = db.prepare('SELECT count(*) as c FROM audits').get().c;
db.exec('DELETE FROM audits WHERE id NOT IN (SELECT audit_id FROM scorecards WHERE audit_id IS NOT NULL);');
const afterCount = db.prepare('SELECT count(*) as c FROM audits').get().c;
console.log(`Cleaned up audits: Before = ${beforeCount}, After = ${afterCount}, Purged = ${beforeCount - afterCount}`);

// Verify remaining duplicates
const dupes = db.prepare('SELECT call_id, count(*) as cnt FROM audits GROUP BY call_id HAVING count(*) > 1').all();
console.log('Remaining duplicates in audits:', dupes.length);

// Summary statistics
const stats = db.prepare(`
  SELECT 
    count(*) as total_scorecards,
    sum(case when q1_status = 'PASS' then 1 else 0 end) as q1_pass,
    sum(case when q2_status = 'PASS' then 1 else 0 end) as q2_pass,
    sum(case when q3_status = 'PASS' then 1 else 0 end) as q3_pass,
    sum(case when q4_status = 'PASS' then 1 else 0 end) as q4_pass,
    sum(case when q5_status = 'PASS' then 1 else 0 end) as q5_pass,
    sum(case when score = 5 then 1 else 0 end) as score_5,
    sum(case when score = 4 then 1 else 0 end) as score_4,
    sum(case when score = 3 then 1 else 0 end) as score_3,
    sum(case when score = 0 then 1 else 0 end) as score_0,
    sum(is_fatal) as fatal_calls
  FROM scorecards
`).get();
console.log('Summary Stats:', stats);

// Sample verified Q2 PASS evidence with client ID
const sampleQ2Passes = db.prepare(`
  SELECT call_id, client_code, q2_status, substr(q2_evidence, 1, 150) as ev
  FROM scorecards
  WHERE q2_status = 'PASS'
  LIMIT 5
`).all();
console.log('\nSample Q2 PASS Evidence:', sampleQ2Passes);

// Sample genuine Q2 FAIL evidence
const sampleQ2Fails = db.prepare(`
  SELECT call_id, client_code, q2_status, substr(q2_evidence, 1, 150) as ev
  FROM scorecards
  WHERE q2_status = 'FAIL' AND fatal_reasons NOT LIKE '%SCRAP_CALL%'
  LIMIT 5
`).all();
console.log('\nSample genuine Q2 FAIL Evidence:', sampleQ2Fails);
