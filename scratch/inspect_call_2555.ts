import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const call = db.prepare('SELECT * FROM calls WHERE id = 2555').get() as any;
console.log('Call 2555:', {
  id: call.id,
  call_time: call.call_time,
  client: call.client || call.client_code,
  phone: call.customer_number || call.calling_number || call.phone_number,
  matched_trade_id: call.matched_trade_id,
  transcript: call.transcript
});

const client = call.client || call.client_code;
const phone = call.customer_number || call.calling_number;
const trades = db.prepare(`
  SELECT id, client, phone_number, symbol, quantity, price, trade_time
  FROM trades
  WHERE client = ? OR phone_number = ? OR phone_number LIKE ?
  ORDER BY trade_time ASC
`).all(client, phone, `%${phone}`) as any[];

console.log(`\nTrades for client ${client} / phone ${phone} (${trades.length} trades):`);
for (const t of trades) {
  console.log(`  Trade ${t.id} at ${t.trade_time}: Sym: ${t.symbol}, Qty: ${t.quantity}, Price: ${t.price}`);
}
