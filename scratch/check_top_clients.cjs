const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Check WIA12276 calls
console.log('=== CHECKING WIA12276 CALLS ===');
const wia12276 = db.prepare(`
  SELECT c.id, c.client_code, s.q2_status, s.q2_evidence, substr(c.transcript, 1, 180) as tr
  FROM calls c
  JOIN scorecards s ON c.id = s.call_id
  WHERE c.client_code = 'WIA12276'
`).all();

const passCount12276 = wia12276.filter(c => c.q2_status === 'PASS').length;
console.log(`WIA12276 total calls: ${wia12276.length}, Q2 PASS: ${passCount12276}, Q2 FAIL: ${wia12276.length - passCount12276}`);

console.log('Sample WIA12276 FAIL transcripts:');
wia12276.filter(c => c.q2_status === 'FAIL').slice(0, 8).forEach(c => {
  console.log(`Call #${c.id}: "${c.tr.replace(/\n/g, ' ')}"`);
});

// Check WID56889 calls
console.log('\n=== CHECKING WID56889 CALLS ===');
const wid56889 = db.prepare(`
  SELECT c.id, c.client_code, s.q2_status, s.q2_evidence, substr(c.transcript, 1, 180) as tr
  FROM calls c
  JOIN scorecards s ON c.id = s.call_id
  WHERE c.client_code = 'WID56889'
`).all();

const passCount56889 = wid56889.filter(c => c.q2_status === 'PASS').length;
console.log(`WID56889 total calls: ${wid56889.length}, Q2 PASS: ${passCount56889}, Q2 FAIL: ${wid56889.length - passCount56889}`);

console.log('Sample WID56889 FAIL transcripts:');
wid56889.filter(c => c.q2_status === 'FAIL').slice(0, 8).forEach(c => {
  console.log(`Call #${c.id}: "${c.tr.replace(/\n/g, ' ')}"`);
});
