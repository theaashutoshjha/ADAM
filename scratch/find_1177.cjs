const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const checks = [
  ["SELECT count(*) as c FROM calls WHERE duration_seconds >= 10", "calls duration >= 10"],
  ["SELECT count(*) as c FROM calls WHERE duration_seconds >= 6", "calls duration >= 6"],
  ["SELECT count(*) as c FROM calls WHERE customer_number IN (SELECT customer_number FROM trades)", "calls with trade customer_number"],
  ["SELECT count(*) as c FROM calls WHERE phone_number IN (SELECT phone_number FROM trades)", "calls with trade phone_number"],
  ["SELECT count(*) as c FROM calls WHERE client_code IN (SELECT client FROM trades)", "calls with trade client"],
  ["SELECT count(*) as c FROM trades WHERE customer_number IN (SELECT customer_number FROM calls)", "trades matching call customer_number"],
  ["SELECT count(*) as c FROM trades WHERE phone_number IN (SELECT phone_number FROM calls)", "trades matching call phone_number"],
  ["SELECT count(DISTINCT id) as c FROM trades WHERE customer_number IN (SELECT DISTINCT coalesce(customer_number, calling_number, phone_number) FROM calls)", "trades matching any call phone"],
  ["SELECT count(*) as c FROM calls WHERE transcript IS NOT NULL", "calls with transcript"],
  ["SELECT count(*) as c FROM calls WHERE call_time BETWEEN '09:15:00' AND '15:40:00'", "calls within market hours"],
  ["SELECT count(*) as c FROM trades WHERE trade_time BETWEEN '09:15:00' AND '15:40:00'", "trades within market hours"],
  ["SELECT count(DISTINCT matched_trade_id) as c FROM calls WHERE matched_trade_id IS NOT NULL", "distinct matched_trade_id in calls"],
  ["SELECT count(*) as c FROM trades WHERE matched_call_id IS NOT NULL", "trades with matched_call_id"]
];

for (const [sql, desc] of checks) {
  try {
    const res = db.prepare(sql).get();
    console.log(`${desc.padEnd(45)}: ${res.c}`);
  } catch (err) {
    console.log(`${desc.padEnd(45)}: ERROR ${err.message}`);
  }
}
