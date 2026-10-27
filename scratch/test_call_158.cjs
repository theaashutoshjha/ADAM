const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

// Require the same functions or run audit on call 158
const c158 = db.prepare('SELECT * FROM calls WHERE id = 158').get();
console.log('Call 158:', c158);

const trades = db.prepare('SELECT * FROM trades').all();
const cleanPhone = (s) => (s ? String(s).replace(/\D/g, '').slice(-10) : '');
const p = cleanPhone(c158.calling_number);
const cTrades = trades.filter(t => cleanPhone(t.phone_number) === p);
console.log('Trades for phone', p, ':', cTrades.length);
