import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const junkCallIds = [1, 2, 28, 81, 146, 190, 201, 222, 272, 348, 387, 534, 542, 1503, 1833, 2842, 2889, 3103, 3659, 4122];

for (const id of junkCallIds.slice(0, 5)) {
  const c = db.prepare('SELECT * FROM calls WHERE id = ?').get(id) as any;
  const phone = c.customer_number || c.calling_number || c.phone_number;
  const client = c.client_code || c.client;
  
  console.log(`\nJunk Call ${id} (dur: ${c.duration_seconds}s, time: ${c.call_time}, client: ${client}, phone: ${phone})`);
  console.log(`Matched trade: ${c.matched_trade_id}`);
  
  // Find other calls for this client or phone
  const otherCalls = db.prepare(`
    SELECT id, duration_seconds, call_time, classification, transcript
    FROM calls
    WHERE id != ? AND (customer_number = ? OR calling_number = ? OR phone_number = ? OR client_code = ? OR client = ?)
    ORDER BY duration_seconds DESC
  `).all(id, phone, phone, phone, client, client) as any[];

  console.log(`Found ${otherCalls.length} other calls for client ${client} / phone ${phone}:`);
  for (const oc of otherCalls.slice(0, 3)) {
    console.log(`  -> Candidate Call ${oc.id} (dur: ${oc.duration_seconds}s, time: ${oc.call_time}, class: ${oc.classification})`);
    console.log(`     Snippet: ${oc.transcript?.slice(0, 150)}...\n`);
  }
}
