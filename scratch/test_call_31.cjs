const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000;');

const cleanPhone = (s) => {
  if (!s) return '';
  const digits = String(s).replace(/\D/g, '');
  return digits.slice(-10);
};

const trades = db.prepare(`
  SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, price_display, notes
  FROM trades
`).all();

const tradePhoneNumbers = new Set(trades.map(tr => cleanPhone(tr.phone_number)).filter(p => p && p.length === 10));

const call = db.prepare(`
  SELECT id, recording_name, caller_id, calling_number, customer_number, client_code, call_date, call_time, duration_seconds, transcript, spoken_language
  FROM calls WHERE id = 31
`).get();

const p1 = cleanPhone(call.calling_number);
const p2 = cleanPhone(call.customer_number);
const phone = (p1 && tradePhoneNumbers.has(p1)) ? p1 : ((p2 && tradePhoneNumbers.has(p2)) ? p2 : (p1 || p2));

console.log('Call 31 phone:', phone);
console.log('tradePhoneNumbers.has(phone):', tradePhoneNumbers.has(phone));
