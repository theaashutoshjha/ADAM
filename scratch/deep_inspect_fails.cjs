const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.dealer_name, c.caller_name, c.duration_seconds,
         c.calling_number, c.customer_number, c.call_date, c.call_time, c.transcript,
         s.score, s.is_fatal, s.q1_status, s.q2_status, s.q2_evidence, s.q3_status
  FROM calls c
  JOIN scorecards s ON c.id = s.call_id
  WHERE c.call_type = 'pre_order'
  ORDER BY c.id ASC
`).all();

console.log(`Deep Inspecting all ${calls.length} pre-order calls...`);

// Let's inspect dealers
const dealers = {};
for (const c of calls) {
  const d = c.dealer_name || c.caller_name || 'Unknown';
  dealers[d] = (dealers[d] || 0) + 1;
}
console.log('Calls per Dealer / Advisor:');
console.log(dealers);

// Let's inspect calls where transcript is > 50 chars but Q2 was marked FAIL
const longFails = calls.filter(c => c.q2_status === 'FAIL' && c.transcript && c.transcript.length >= 60);
console.log(`\nConversational Calls where Q2 is currently FAIL: ${longFails.length}`);

// Let's inspect if any dealer habitually confirms client ID in specific ways
// We'll search for words: 'code', 'id', 'w', 'p', 'account', 'confirm', 'client', 'plain', 'line', 'credit', 'double', 'training', 'claim'
const potentialMentions = [];
for (const c of longFails) {
  const t = c.transcript.toLowerCase();
  const ucc = (c.client_code || '').toUpperCase();
  const numPart = ucc.slice(3);
  const prefix = ucc.slice(0, 3);

  // Check if dealer uttered any potential UCC fragment
  const cues = ['code', 'client', 'id', 'account', 'confirm', 'plain', 'line', 'credit', 'double', 'training', 'claim', 'pin', 'w', 'p'];
  const hasCue = cues.some(w => t.includes(w));
  
  // Check if any numbers exist
  const hasNumbers = /\d{3,}/.test(t);

  if (hasCue && hasNumbers) {
    potentialMentions.push({
      id: c.id,
      dealer: c.dealer_name || c.caller_name,
      ucc,
      transcript: c.transcript
    });
  }
}

console.log(`Long Fail calls with potential UCC cues & numbers: ${potentialMentions.length}`);
console.log('\n--- 20 Sample Potential UCC Mentions among current FAILS ---');
for (const p of potentialMentions.slice(0, 20)) {
  console.log(`[Call #${p.id} - ${p.dealer}] Target UCC: ${p.ucc}`);
  console.log(`Transcript: "${p.transcript}"\n`);
}
