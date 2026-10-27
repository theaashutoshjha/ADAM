const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, client_code, dealer_name, transcript, duration_seconds
  FROM calls
  WHERE client_code IN ('WIA12276', 'WIA16432') AND call_type = 'pre_order' AND length(transcript) > 50
`).all();

console.log(`Conversations for WIA12276 and WIA16432: ${calls.length}`);
for (const c of calls.slice(0, 15)) {
  console.log(`[Call #${c.id} - ${c.client_code} - ${c.dealer_name}] "${c.transcript}"\n`);
}
