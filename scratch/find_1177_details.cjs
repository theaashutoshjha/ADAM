const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const trades = db.prepare('SELECT * FROM trades').all();
const calls = db.prepare('SELECT id, phone_number, customer_number, calling_number, call_date, call_time, duration_seconds, transcript FROM calls').all();

// Phone maps
const callsByPhone = new Map();
for (const c of calls) {
  const p = (c.customer_number || c.calling_number || c.phone_number || '').replace(/\D/g, '').slice(-10);
  if (p && p.length === 10) {
    if (!callsByPhone.has(p)) callsByPhone.set(p, []);
    callsByPhone.get(p).push(c);
  }
}

let tradesWithAnyCall = 0;
let tradesWithPriorCall = 0;
let tradesWithPriorCallUnder2h = 0;
let tradesWithNonScrapPriorCall = 0;

for (const t of trades) {
  const p = (t.customer_number || t.client_number || t.phone_number || '').replace(/\D/g, '').slice(-10);
  if (!p || !callsByPhone.has(p)) continue;
  tradesWithAnyCall++;

  const clientCalls = callsByPhone.get(p).filter(c => c.call_date === t.trade_date);
  const prior = clientCalls.filter(c => c.call_time <= t.trade_time);
  if (prior.length > 0) {
    tradesWithPriorCall++;
  }
}

console.log({
  totalTrades: trades.length,
  tradesWithAnyCall,
  tradesWithPriorCall
});
