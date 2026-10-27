const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls12276 = db.prepare(`SELECT id, dealer_name, transcript FROM calls WHERE client_code = 'WIA12276' AND call_type = 'pre_order' LIMIT 10`).all();
console.log('=== Sample Calls for WIA12276 ===');
for (const c of calls12276) {
  console.log(`[Call #${c.id} - ${c.dealer_name}] "${c.transcript}"\n`);
}

const calls16432 = db.prepare(`SELECT id, dealer_name, transcript FROM calls WHERE client_code = 'WIA16432' AND call_type = 'pre_order' LIMIT 10`).all();
console.log('=== Sample Calls for WIA16432 ===');
for (const c of calls16432) {
  console.log(`[Call #${c.id} - ${c.dealer_name}] "${c.transcript}"\n`);
}
