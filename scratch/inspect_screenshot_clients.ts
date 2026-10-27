import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

console.log('=== CLIENT 1: PWA03264 (Sai Deekshith GN) ===');
const trades1 = db.prepare(`
  SELECT id, trade_date, trade_time, symbol, quantity, price, phone_number
  FROM trades
  WHERE client = 'PWA03264' OR phone_number LIKE '%9686410304%'
  ORDER BY trade_date, trade_time
`).all();
console.log('Trades for PWA03264:');
console.table(trades1);

const calls1 = db.prepare(`
  SELECT id, caller_id, call_date, call_time, duration_seconds, customer_number, calling_number
  FROM calls
  WHERE client_code = 'PWA03264' OR customer_number LIKE '%9686410304%' OR calling_number LIKE '%9686410304%'
  ORDER BY call_date, call_time
`).all();
console.log('Calls for PWA03264:');
console.table(calls1);

console.log('=== CLIENT 2: WIG62920 (Siva S) ===');
const trades2 = db.prepare(`
  SELECT id, trade_date, trade_time, symbol, quantity, price, phone_number
  FROM trades
  WHERE client = 'WIG62920' OR phone_number LIKE '%9840489999%'
  ORDER BY trade_date, trade_time
`).all();
console.log('Trades for WIG62920:');
console.table(trades2);

const calls2 = db.prepare(`
  SELECT id, caller_id, call_date, call_time, duration_seconds, customer_number, calling_number
  FROM calls
  WHERE client_code = 'WIG62920' OR customer_number LIKE '%9840489999%' OR calling_number LIKE '%9840489999%'
  ORDER BY call_date, call_time
`).all();
console.log('Calls for WIG62920:');
console.table(calls2);
