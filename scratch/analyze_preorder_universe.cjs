const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`SELECT id, caller_id, calling_number, customer_number, client_code, call_type, classification, matched_trade_id, transcript FROM calls`).all();
const trades = db.prepare(`SELECT id, client, phone_number, symbol, quantity, price, trade_date, trade_time FROM trades`).all();

console.log(`Total calls: ${calls.length}, Total trades: ${trades.length}`);

// Trades phone set and client set
const tradePhones = new Set();
const tradeClients = new Set();
for (const t of trades) {
  if (t.phone_number) {
    const p = String(t.phone_number).replace(/\D/g, '').slice(-10);
    if (p.length === 10) tradePhones.add(p);
  }
  if (t.client) {
    tradeClients.add(String(t.client).trim().toUpperCase());
  }
}

console.log(`Distinct trade phones (10-digit): ${tradePhones.size}, Distinct trade client UCCs: ${tradeClients.size}`);

let matchedByPhone = 0;
let matchedByClient = 0;
let classifiedPreOrder = 0;
let withTradeId = 0;
let hasBoth = 0;

for (const c of calls) {
  const p1 = String(c.calling_number || '').replace(/\D/g, '').slice(-10);
  const p2 = String(c.customer_number || '').replace(/\D/g, '').slice(-10);
  const client = String(c.client_code || '').trim().toUpperCase();

  const phoneMatch = (p1.length === 10 && tradePhones.has(p1)) || (p2.length === 10 && tradePhones.has(p2));
  const clientMatch = client && tradeClients.has(client);

  if (phoneMatch) matchedByPhone++;
  if (clientMatch) matchedByClient++;
  if (phoneMatch || clientMatch) hasBoth++;
  if (c.classification === 'PRE_ORDER' || c.call_type === 'pre_order') classifiedPreOrder++;
  if (c.matched_trade_id) withTradeId++;
}

console.log({
  matchedByPhone,
  matchedByClient,
  unionMatched: hasBoth,
  classifiedPreOrder,
  withTradeId
});
