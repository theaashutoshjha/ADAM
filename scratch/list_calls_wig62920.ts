import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const calls = db.prepare(`
  SELECT id, call_time, duration_seconds, classification, transcript
  FROM calls
  WHERE client_code = 'WIG62920' OR customer_number = '9840489999' OR calling_number = '9840489999'
  ORDER BY call_time ASC
`).all() as any[];

console.log(`Total calls for WIG62920: ${calls.length}`);
for (const c of calls) {
  if (c.duration_seconds > 20) {
    console.log(`Call ${c.id} at ${c.call_time} (${c.duration_seconds}s) [${c.classification}]: ${c.transcript?.slice(0, 120)}...`);
  }
}
