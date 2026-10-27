const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, s.q2_status, s.q2_evidence, s.score, s.is_fatal
  FROM calls c
  JOIN scorecards s ON c.id = s.call_id
  WHERE c.call_type = 'pre_order'
`).all();

console.log('Total audited pre-order calls:', calls.length);
const q2Pass = calls.filter(c => c.q2_status === 'PASS');
const q2Fail = calls.filter(c => c.q2_status === 'FAIL');
console.log('Q2 PASS count:', q2Pass.length, 'Q2 FAIL count:', q2Fail.length);

console.log('\n================ SAMPLE Q2 PASS (10 calls) ================');
for (const c of q2Pass.slice(0, 10)) {
  console.log(`[Call #${c.id}] Target UCC: ${c.client_code}`);
  console.log(`Evidence: ${c.q2_evidence}`);
  console.log(`Transcript: "${c.transcript}"\n`);
}

console.log('\n================ SAMPLE Q2 FAIL (10 calls) ================');
for (const c of q2Fail.slice(0, 10)) {
  console.log(`[Call #${c.id}] Target UCC: ${c.client_code}`);
  console.log(`Evidence: ${c.q2_evidence}`);
  console.log(`Transcript: "${c.transcript}"\n`);
}
