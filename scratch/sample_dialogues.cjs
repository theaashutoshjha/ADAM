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

let printed = 0;
for (const call of calls) {
  const p1 = String(call.calling_number || '').replace(/\D/g, '').slice(-10);
  const p2 = String(call.customer_number || '').replace(/\D/g, '').slice(-10);
  const d = call.call_date ? call.call_date.trim() : '';

  const trs = (p1 && d && tradesByPhoneDate.get(`${p1}_${d}`)) || (p2 && d && tradesByPhoneDate.get(`${p2}_${d}`));
  if (!trs || trs.length === 0) continue;

  const t = (call.transcript || '').trim();
  if (t.length < 50 || /voicemail|forwarded\s+to/i.test(t)) continue;

  console.log('========================================================');
  console.log(`Call ID: ${call.id} | Date: ${call.call_date} ${call.call_time} | Client: ${call.client_code || trs[0].client}`);
  console.log(`Executed Trades on this date:`, trs.map(tr => `${tr.symbol} Qty:${tr.quantity} @ ₹${tr.price} (${tr.trade_time})`).join('; '));
  console.log(`Spoken Transcript:`);
  console.log(t);
  printed++;
  if (printed >= 8) break;
}
