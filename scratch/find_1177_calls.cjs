const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Check various call filters
const queries = [
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 15",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 20",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 25",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 30",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 40",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 45",
  "SELECT count(*) as c FROM calls WHERE duration_seconds >= 50",
  "SELECT count(*) as c FROM calls WHERE duration_seconds = 60",
  "SELECT count(DISTINCT phone_number) as c FROM calls",
  "SELECT count(*) as c FROM calls WHERE phone_number IN (SELECT phone_number FROM trades)",
  "SELECT count(DISTINCT customer_number) as c FROM trades",
  "SELECT count(DISTINCT client) as c FROM trades",
  "SELECT count(*) as c FROM trades WHERE trade_type = 'BUY' OR trade_type = 'SELL'",
  "SELECT count(*) as c FROM trades WHERE buy_sell IN ('B', 'S', 'BUY', 'SELL')",
  "SELECT count(*) as c FROM trades WHERE matched_call_id > 0",
  "SELECT count(DISTINCT matched_call_id) as c FROM trades WHERE matched_call_id > 0"
];

for (const q of queries) {
  try {
    const c = db.prepare(q).get().c;
    console.log(q, '==>', c);
  } catch (e) {
    console.log(q, 'ERR:', e.message);
  }
}
