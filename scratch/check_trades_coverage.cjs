const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`SELECT id, calling_number, customer_number, call_date, call_time, client_code, transcript, duration_seconds FROM calls`).all();
const trades = db.prepare(`SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, notes FROM trades`).all();

const tradesByPhoneDate = new Map();
for (const t of trades) {
  const p = String(t.phone_number || '').replace(/\D/g, '').slice(-10);
  const d = t.trade_date ? t.trade_date.trim() : '';
  if (p && d) {
    const key = `${p}_${d}`;
    if (!tradesByPhoneDate.has(key)) tradesByPhoneDate.set(key, []);
    tradesByPhoneDate.get(key).push(t);
  }
}

let totalTradesCovered = 0;
const matchedTradeIds = new Set();
const callsWithTrades = [];

for (const call of calls) {
  const p1 = String(call.calling_number || '').replace(/\D/g, '').slice(-10);
  const p2 = String(call.customer_number || '').replace(/\D/g, '').slice(-10);
  const d = call.call_date ? call.call_date.trim() : '';

  const trs = (p1 && d && tradesByPhoneDate.get(`${p1}_${d}`)) || (p2 && d && tradesByPhoneDate.get(`${p2}_${d}`));
  if (trs && trs.length > 0) {
    callsWithTrades.push({ call, trades: trs });
    for (const t of trs) {
      matchedTradeIds.add(t.id);
    }
  }
}

console.log(`Matched Calls on SAME DATE: ${callsWithTrades.length}`);
console.log(`Distinct Trades covered by these calls on SAME DATE: ${matchedTradeIds.size} out of ${trades.length} total trades`);

// What about trades that have NO call on the same date?
const unmatchedTrades = trades.filter(t => !matchedTradeIds.has(t.id));
console.log(`Trades with NO call on the same date: ${unmatchedTrades.length}`);
const mailNotes = unmatchedTrades.filter(t => (t.notes || '').includes('MAIL'));
console.log(`Of unmatched trades, how many have MAIL in notes: ${mailNotes.length}`);
