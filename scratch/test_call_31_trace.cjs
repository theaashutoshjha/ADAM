const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const cleanPhone = (s) => {
  if (!s) return '';
  const digits = String(s).replace(/\D/g, '');
  return digits.slice(-10);
};

function parseDateTime(dStr, tStr) {
  let y, m, d;
  const parts = dStr.split('-');
  if (parts[0].length === 4) {
    y = Number(parts[0]); m = Number(parts[1]); d = Number(parts[2]);
  } else {
    d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]);
  }
  const [hh, mm, ss] = (tStr || '00:00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss || 0).getTime();
}

function parseStandardDate(dStr) {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) return dStr;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dStr;
}

const call = db.prepare(`
  SELECT id, recording_name, caller_id, calling_number, customer_number, client_code, call_date, call_time, duration_seconds, transcript, spoken_language
  FROM calls WHERE id = 31
`).get();

const p1 = cleanPhone(call.calling_number);
const p2 = cleanPhone(call.customer_number);
const stdDate = parseStandardDate(call.call_date);
const ts = parseDateTime(stdDate, call.call_time);
call.standardDate = stdDate;
call.timestamp = ts;

const trades = db.prepare(`
  SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, price_display, notes
  FROM trades
`).all();

const allPhoneTrades = trades.filter(tr => cleanPhone(tr.phone_number) === p1);
const sameDateTrades = allPhoneTrades.filter(tr => parseStandardDate(tr.trade_date) === call.standardDate);
console.log('Call 31 trades found for phone:', allPhoneTrades.length, 'same date:', sameDateTrades.length);
console.log('Call 31 date:', call.standardDate, 'trades dates:', [...new Set(allPhoneTrades.map(t => parseStandardDate(t.trade_date)))]);
