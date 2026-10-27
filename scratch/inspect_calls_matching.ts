import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

console.log('Calls count:', db.prepare('SELECT COUNT(*) as c FROM calls').get());
console.log('Trades count:', db.prepare('SELECT COUNT(*) as c FROM trades').get());
console.log('Scorecards count:', db.prepare('SELECT COUNT(*) as c FROM scorecards').get());
console.log('Unique call_id in scorecards:', db.prepare('SELECT COUNT(DISTINCT call_id) as c FROM scorecards').get());

const callClass = db.prepare('SELECT classification, call_type, COUNT(*) as c FROM calls GROUP BY classification, call_type').all();
console.log('Call classifications:', callClass);

const callDates = db.prepare('SELECT call_date, COUNT(*) as c FROM calls GROUP BY call_date ORDER BY call_date').all();
console.log('Calls by date:', callDates);

const tradeDates = db.prepare('SELECT trade_date, COUNT(*) as c FROM trades GROUP BY trade_date ORDER BY trade_date').all();
console.log('Trades by date:', tradeDates);
