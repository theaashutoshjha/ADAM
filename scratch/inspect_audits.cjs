const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const scPass = db.prepare("SELECT count(*) as c FROM scorecards WHERE q2_status = 'PASS'").get();
const scFail = db.prepare("SELECT count(*) as c FROM scorecards WHERE q2_status = 'FAIL'").get();
const scTotal = db.prepare("SELECT count(*) as c FROM scorecards").get();

console.log('SCORECARDS: Total =', scTotal.c, 'Q2 PASS =', scPass.c, 'Q2 FAIL =', scFail.c);

// Check if any scorecards have audit_id pointing to an audit where q2 != q2_status
const joined = db.prepare(`
  SELECT s.call_id, s.q2_status as sc_q2, a.q2 as audit_q2, s.client_code, a.q2_evidence
  FROM scorecards s
  LEFT JOIN audits a ON s.audit_id = a.id
  WHERE s.q2_status != a.q2
`).all();

console.log('Scorecard vs linked Audit mismatch count:', joined.length);
if (joined.length > 0) {
  console.log('Sample linked mismatches:', joined.slice(0, 5));
}

// Check duplicates in audits
const dupes = db.prepare('SELECT call_id, count(*) as cnt FROM audits GROUP BY call_id HAVING count(*) > 1').all();
console.log('Calls with duplicate audit rows:', dupes.length);

// Summary of 5-point scores in scorecards
const scoreBreakdown = db.prepare(`
  SELECT score, count(*) as count, sum(is_fatal) as fatal_count
  FROM scorecards
  GROUP BY score
  ORDER BY score DESC
`).all();
console.log('Score Breakdown:', scoreBreakdown);
