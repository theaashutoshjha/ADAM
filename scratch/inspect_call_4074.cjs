const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const call = db.prepare('SELECT * FROM calls WHERE id = 4074').get();
console.log('Call 4074:', {
  id: call.id,
  caller_id: call.caller_id,
  customer_number: call.customer_number,
  calling_number: call.calling_number,
  client_code: call.client_code,
  call_date: call.call_date,
  call_time: call.call_time,
  matched_trade_id: call.matched_trade_id,
  trade_match_status: call.trade_match_status
});

console.log('Call 4074 transcript:', call.transcript);

if (call.matched_trade_id) {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(call.matched_trade_id);
  console.log('Trade 777:', trade);
}

// Find any trade with matching phone number or client
const matchingTrades = db.prepare(`
  SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price 
  FROM trades 
  WHERE phone_number = ? OR client = ?
`).all(call.calling_number, call.client_code);
console.log('Matching trades for caller phone/client:', matchingTrades);
