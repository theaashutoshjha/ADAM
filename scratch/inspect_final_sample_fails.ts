import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

console.log('--- SAMPLE Q2 FAILS (5 Cases) ---');
const q2Fails = db.prepare(`
  SELECT s.id, s.call_id, s.client, s.calling_number, s.registered_number, s.q2_evidence, s.fatal_reasons, c.duration_seconds, c.transcript
  FROM scorecards s
  LEFT JOIN calls c ON c.id = s.call_id
  WHERE s.is_current = 1 AND s.q2_status = 'FAIL'
  LIMIT 5
`).all() as any[];

for (const f of q2Fails) {
  console.log(`\nCard ${f.id} (Call ${f.call_id}, Dur: ${f.duration_seconds}s) | Client: ${f.client}`);
  console.log(`Calling: ${f.calling_number} vs Registered: ${f.registered_number}`);
  console.log(`Evidence: ${f.q2_evidence}`);
  console.log(`Transcript:\n${f.transcript.slice(0, 300)}`);
}

console.log('\n--- SAMPLE Q3 FAILS (5 Cases) ---');
const q3Fails = db.prepare(`
  SELECT s.id, s.call_id, s.resolved_trade_id, s.q3_evidence, c.duration_seconds, t.symbol, t.quantity, t.price, c.transcript
  FROM scorecards s
  LEFT JOIN calls c ON c.id = s.call_id
  LEFT JOIN trades t ON t.id = s.resolved_trade_id
  WHERE s.is_current = 1 AND s.q3_status = 'FAIL'
  LIMIT 5
`).all() as any[];

for (const f of q3Fails) {
  console.log(`\nCard ${f.id} (Call ${f.call_id}, Dur: ${f.duration_seconds}s) | Trade: ${f.symbol} Qty: ${f.quantity} Price: ${f.price}`);
  console.log(`Evidence: ${f.q3_evidence}`);
  console.log(`Transcript:\n${f.transcript.slice(0, 300)}`);
}
