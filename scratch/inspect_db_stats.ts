import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve('.data/auditeq_production.db');
const db = new DatabaseSync(dbPath);

console.log('--- CALLS STATS ---');
const callTotal = db.prepare('SELECT count(*) as c FROM calls').get();
const callClass = db.prepare('SELECT classification, count(*) as c FROM calls GROUP BY classification').all();
const callType = db.prepare('SELECT call_type, count(*) as c FROM calls GROUP BY call_type').all();
const callMatched = db.prepare('SELECT count(*) as c FROM calls WHERE matched_trade_id IS NOT NULL').get();
console.log('Total calls:', callTotal);
console.log('By classification:', callClass);
console.log('By call_type:', callType);
console.log('Calls with matched_trade_id:', callMatched);

console.log('--- TRADES STATS ---');
const tradeTotal = db.prepare('SELECT count(*) as c FROM trades').get();
const tradeMatched = db.prepare('SELECT count(*) as c FROM trades WHERE matched_call_id IS NOT NULL').get();
console.log('Total trades:', tradeTotal);
console.log('Trades with matched_call_id:', tradeMatched);

console.log('--- AUDITS STATS ---');
const auditTotal = db.prepare('SELECT count(*) as c FROM audits').get();
const scorecardTotal = db.prepare('SELECT count(*) as c FROM scorecards').get();
console.log('Total audits:', auditTotal);
console.log('Total scorecards:', scorecardTotal);

console.log('--- SAMPLE OF PRE_ORDER CALLS ---');
const samplePreOrders = db.prepare("SELECT id, caller_id, call_time, duration_seconds, classification, call_type, status, matched_trade_id, client_code, substr(transcript, 1, 80) as tx FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order' LIMIT 10").all();
console.log(samplePreOrders);
