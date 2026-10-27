const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, recording_name, caller_id, calling_number, customer_number, client_code, call_date, call_time, duration_seconds, transcript, spoken_language
  FROM calls
`).all();

const trades = db.prepare(`
  SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, price_display, notes
  FROM trades
`).all();

const cleanPhone = (s) => {
  if (!s) return '';
  const digits = String(s).replace(/\D/g, '');
  return digits.slice(-10);
};

const tradePhoneNumbers = new Set(trades.map(tr => cleanPhone(tr.phone_number)).filter(p => p && p.length === 10));

const existingScorecardCallIds = new Set(db.prepare('SELECT call_id FROM scorecards').all().map(r => r.call_id));

console.log('Total calls:', calls.length);
console.log('Existing scorecards:', existingScorecardCallIds.size);

const missingCalls = [];
for (const call of calls) {
  const p1 = cleanPhone(call.calling_number);
  const p2 = cleanPhone(call.customer_number);
  const phone = (p1 && tradePhoneNumbers.has(p1)) ? p1 : ((p2 && tradePhoneNumbers.has(p2)) ? p2 : (p1 || p2));

  if (phone && tradePhoneNumbers.has(phone)) {
    if (!existingScorecardCallIds.has(call.id)) {
      missingCalls.push(call);
    }
  }
}

console.log('Missing pre-order calls count:', missingCalls.length);
for (const m of missingCalls.slice(0, 10)) {
  console.log(`Call ID ${m.id}: date=${m.call_date}, time=${m.call_time}, transcript="${m.transcript}"`);
}
