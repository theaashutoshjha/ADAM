const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const score5Calls = db.prepare(`
  SELECT s.id as sc_id, s.call_id, s.client_code, s.q2_status, s.q2_evidence, s.q3_status, s.q3_evidence, c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.score = 5
`).all();

console.log('Total 5/5 scorecards:', score5Calls.length);

let suspect = 0;
for (const sc of score5Calls) {
  const t = (sc.transcript || '').trim();
  if (t.length < 25 || /\[Silence/i.test(t) || /voicemail/i.test(t)) {
    console.log('SUSPECT (silence/short):', sc.call_id, t);
    suspect++;
  }
}
console.log('Suspect 5/5 calls with silence/short:', suspect);

// Print 3 random 5/5 calls with their transcripts
console.log('\n--- Sample 5/5 Transcripts ---');
for (const sc of score5Calls.slice(0, 3)) {
  console.log(`Call ID: ${sc.call_id}, UCC: ${sc.client_code}`);
  console.log(`Q2: ${sc.q2_evidence}`);
  console.log(`Q3: ${sc.q3_evidence}`);
  console.log(`Transcript: "${sc.transcript.slice(0, 200)}..."\n`);
}
