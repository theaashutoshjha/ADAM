const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`SELECT id, calling_number, customer_number, call_date, call_time, client_code, transcript FROM calls`).all();
const trades = db.prepare(`SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, notes FROM trades`).all();

console.log(`Total calls: ${calls.length}, Total trades: ${trades.length}`);

// Map trades by: phone + date, and client + date
const tradesByPhoneDate = new Map();
const tradesByClientDate = new Map();

for (const t of trades) {
  const p = String(t.phone_number || '').replace(/\D/g, '').slice(-10);
  const d = t.trade_date ? t.trade_date.trim() : '';
  const c = t.client ? t.client.trim().toUpperCase() : '';

  if (p && d) {
    const key = `${p}_${d}`;
    if (!tradesByPhoneDate.has(key)) tradesByPhoneDate.set(key, []);
    tradesByPhoneDate.get(key).push(t);
  }

  if (c && d) {
    const key = `${c}_${d}`;
    if (!tradesByClientDate.has(key)) tradesByClientDate.set(key, []);
    tradesByClientDate.get(key).push(t);
  }
}

console.log(`Unique (phone, trade_date) pairs: ${tradesByPhoneDate.size}`);
console.log(`Unique (client, trade_date) pairs: ${tradesByClientDate.size}`);

// Now let's check how many calls match on the EXACT SAME DATE
let matchedSameDateByPhone = 0;
let matchedSameDateByClient = 0;
let matchedSameDateAny = 0;
const matchedCallIds = new Set();

for (const call of calls) {
  const p1 = String(call.calling_number || '').replace(/\D/g, '').slice(-10);
  const p2 = String(call.customer_number || '').replace(/\D/g, '').slice(-10);
  const d = call.call_date ? call.call_date.trim() : '';
  const c = call.client_code ? call.client_code.trim().toUpperCase() : '';

  const phoneMatch = (p1 && d && tradesByPhoneDate.has(`${p1}_${d}`)) || (p2 && d && tradesByPhoneDate.has(`${p2}_${d}`));
  const clientMatch = c && d && tradesByClientDate.has(`${c}_${d}`);

  if (phoneMatch) matchedSameDateByPhone++;
  if (clientMatch) matchedSameDateByClient++;
  if (phoneMatch || clientMatch) {
    matchedSameDateAny++;
    matchedCallIds.add(call.id);
  }
}

console.log({
  matchedSameDateByPhone,
  matchedSameDateByClient,
  matchedSameDateAny,
  distinctCallsMatched: matchedCallIds.size
});
