const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT id, caller_id, customer_number, calling_number, client_code, call_date, call_time, classification, length(transcript) as tlen
  FROM calls
  WHERE transcript IS NOT NULL AND length(trim(transcript)) >= 15
    AND (matched_trade_id IS NULL OR matched_trade_id = 0)
`).all();

console.log('Transcribed calls without trade match:', calls.length);

let phoneMatchesTrade = 0;
let clientMatchesTrade = 0;

for (const c of calls) {
  const pMatch = db.prepare('SELECT id FROM trades WHERE phone_number = ? OR client_number = ? LIMIT 1').get(c.customer_number || c.calling_number, c.customer_number || c.calling_number);
  const clMatch = db.prepare('SELECT id FROM trades WHERE client = ? OR client_code = ? LIMIT 1').get(c.client_code, c.client_code);
  if (pMatch) phoneMatchesTrade++;
  if (clMatch) clientMatchesTrade++;
}

console.log({
  totalWithoutTradeMatch: calls.length,
  phoneMatchesTrade,
  clientMatchesTrade
});
