const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const fatals = db.prepare(`
  SELECT s.id, s.call_id, s.client, s.score, s.is_fatal, s.fatal_reasons, s.q1_status, s.q2_status, s.q3_status, s.q4_status, s.q5_status, 
         s.q1_evidence, s.q2_evidence, s.q3_evidence, c.transcript, t.symbol, t.quantity, t.price
  FROM scorecards s 
  JOIN calls c ON s.call_id = c.id 
  LEFT JOIN trades t ON c.matched_trade_id = t.id
  WHERE s.is_fatal = 1 AND length(c.transcript) > 100
  LIMIT 5
`).all();

console.log('Fatal calls with long transcripts:');
for (const f of fatals) {
  console.log('--------------------------------------------------');
  console.log('Call ID:', f.call_id, 'Client:', f.client, 'Symbol:', f.symbol, 'Qty:', f.quantity, 'Price:', f.price);
  console.log('Fatal reasons:', f.fatal_reasons);
  console.log('Q1:', f.q1_status, 'Ev:', f.q1_evidence);
  console.log('Q2:', f.q2_status, 'Ev:', f.q2_evidence);
  console.log('Q3:', f.q3_status, 'Ev:', f.q3_evidence);
  console.log('Transcript:', f.transcript);
}
