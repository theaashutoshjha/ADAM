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

// Check how many trades match a call
let matchedTrades = 0;
let matchedPreOrderCalls = new Set();
let matchedTradesList = [];

for (const t of trades) {
  const p = (t.customer_number || t.client_number || t.phone_number || '').replace(/\D/g, '').slice(-10);
  if (!p || !callsByPhone.has(p)) continue;

  const clientCalls = callsByPhone.get(p).filter(c => c.call_date === t.trade_date);
  // Any call on trade date placed before trade or within tolerance
  const valid = clientCalls.filter(c => {
    return c.call_time <= t.trade_time || c.call_time <= '15:35:00';
  });

  if (valid.length > 0) {
    matchedTrades++;
    matchedTradesList.push(t);
    valid.forEach(v => matchedPreOrderCalls.add(v.id));
  }
}

console.log('Trades matching pre-order calls:', matchedTrades);
console.log('Total distinct calls matched to trades:', matchedPreOrderCalls.size);

// What about trades matching by client code?
let tradesMatchingByClientCode = 0;
const callsByCode = new Map();
for (const c of calls) {
  const code = (c.client_code || '').trim().toUpperCase();
  if (code) {
    if (!callsByCode.has(code)) callsByCode.set(code, []);
    callsByCode.get(code).push(c);
  }
}
for (const t of trades) {
  const code = (t.client || t.client_code || '').trim().toUpperCase();
  if (code && callsByCode.has(code)) {
    tradesMatchingByClientCode++;
  }
}
console.log('Trades matching calls by client code:', tradesMatchingByClientCode);
