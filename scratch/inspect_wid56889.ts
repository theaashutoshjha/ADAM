import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

const trades = db.prepare("SELECT * FROM trades WHERE client = 'WID56889'").all() as any[];
console.log('Trades for WID56889:', trades.length);
for (const t of trades) {
  console.log(`  Trade #${t.id}: ${t.symbol} qty=${t.quantity} price=${t.price} time=${t.trade_time} phone=${t.phone_number || t.client_number}`);
}

const clientPhone = trades[0]?.phone_number || trades[0]?.client_number;
console.log('Client phone:', clientPhone);

const calls = db.prepare("SELECT id, recording_name, call_date, call_time, duration_seconds, calling_number, phone_number, transcript FROM calls WHERE calling_number LIKE ? OR phone_number LIKE ? OR customer_number LIKE ? OR transcript LIKE '%56889%'").all(`%${clientPhone?.slice(-8)}%`, `%${clientPhone?.slice(-8)}%`, `%${clientPhone?.slice(-8)}%`) as any[];

console.log('Calls for WID56889:', calls.length);
for (const c of calls) {
  console.log(`  Call #${c.id} (${c.call_time}, dur=${c.duration_seconds}s): ${c.transcript}`);
}
