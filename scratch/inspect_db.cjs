const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('--- Table counts ---');
for (const t of tables) {
  try {
    const c = db.prepare(`SELECT count(*) as count FROM "${t.name}"`).get();
    console.log(`${t.name}: ${c.count}`);
  } catch (e) {
    console.log(`${t.name}: error - ${e.message}`);
  }
}

console.log('\n--- Checking for 1177 occurrences ---');
// Let's test various WHERE clauses on calls and trades
const queries = [
  "SELECT count(*) as c FROM calls WHERE duration_seconds > 0 AND status != 'SCRAP'",
  "SELECT count(*) as c FROM calls WHERE status != 'SCRAP'",
  "SELECT count(*) as c FROM calls WHERE classification != 'SCRAP'",
  "SELECT count(*) as c FROM calls WHERE classification IN ('PRE_ORDER', 'NON_PRE_ORDER')",
  "SELECT count(*) as c FROM calls WHERE classification IN ('PRE_ORDER', 'REGULAR')",
  "SELECT count(*) as c FROM calls WHERE matched_trade_id IS NOT NULL",
  "SELECT count(DISTINCT matched_call_id) as c FROM trades WHERE matched_call_id IS NOT NULL",
  "SELECT count(*) as c FROM trades WHERE matched_call_id IS NOT NULL",
  "SELECT count(*) as c FROM trades WHERE status = 'MATCHED'",
  "SELECT count(*) as c FROM calls WHERE is_pre_order = 1",
  "SELECT count(*) as c FROM calls WHERE call_type = 'pre_order'",
  "SELECT count(*) as c FROM calls WHERE call_type != 'scrap'",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 10",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 6",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 15",
  "SELECT count(*) as c FROM calls WHERE audio_path IS NOT NULL OR storage_path IS NOT NULL",
];

for (const q of queries) {
  try {
    const res = db.prepare(q).get();
    console.log(`${q} => ${res.c}`);
  } catch (e) {
    // column might not exist
  }
}
