import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const prodDb = path.join(process.cwd(), '.data', 'auditeq_production.db');
const standardDb = path.join(process.cwd(), '.data', 'auditeq.db');
const DB_PATH =
  process.env.DATABASE_PATH ||
  (fs.existsSync(prodDb) && fs.statSync(prodDb).size > 0
    ? prodDb
    : (fs.existsSync(standardDb) && fs.statSync(standardDb).size > 0
      ? standardDb
      : prodDb));

console.log('Using DB_PATH:', DB_PATH);
const db = new DatabaseSync(DB_PATH);

console.log('=== TABLES ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
console.log(tables.map(t => t.name));

console.log('\n=== CALLS TOTAL & DUPLICATES ===');
const totalCalls = (db.prepare("SELECT COUNT(*) as count FROM calls").get() as any).count;
console.log('Total calls:', totalCalls);

const dupRecordings = db.prepare(`
  SELECT recording_name, COUNT(*) as c, GROUP_CONCAT(id) as ids 
  FROM calls 
  WHERE recording_name IS NOT NULL AND recording_name != '' 
  GROUP BY recording_name 
  HAVING c > 1
`).all() as any[];
console.log('Duplicate recording_names count:', dupRecordings.length);
if (dupRecordings.length > 0) {
  console.log('Sample duplicate recording_names:', JSON.stringify(dupRecordings.slice(0, 10), null, 2));
}

const dupCallerIds = db.prepare(`
  SELECT caller_id, COUNT(*) as c, GROUP_CONCAT(id) as ids 
  FROM calls 
  WHERE caller_id IS NOT NULL AND caller_id != '' 
  GROUP BY caller_id 
  HAVING c > 1
`).all() as any[];
console.log('Duplicate caller_ids count:', dupCallerIds.length);
if (dupCallerIds.length > 0) {
  console.log('Sample duplicate caller_ids:', JSON.stringify(dupCallerIds.slice(0, 10), null, 2));
}

console.log('\n=== MULTI TRADES PER CALL ===');
const multiTrades = db.prepare(`
  SELECT matched_call_id, COUNT(*) as c, GROUP_CONCAT(id) as trade_ids, GROUP_CONCAT(symbol) as symbols 
  FROM trades 
  WHERE matched_call_id IS NOT NULL 
  GROUP BY matched_call_id 
  HAVING c > 1
`).all() as any[];
console.log('Calls with multiple trades:', multiTrades.length);
if (multiTrades.length > 0) {
  console.log('Sample calls with multiple trades:', JSON.stringify(multiTrades.slice(0, 10), null, 2));
}

const scorecardsMulti = db.prepare(`
  SELECT call_id, COUNT(*) as c, GROUP_CONCAT(id) as sc_ids, GROUP_CONCAT(resolved_trade_id) as trade_ids 
  FROM scorecards 
  GROUP BY call_id 
  HAVING c > 1
`).all() as any[];
console.log('Calls with multiple scorecards:', scorecardsMulti.length);
if (scorecardsMulti.length > 0) {
  console.log('Sample calls with multiple scorecards:', JSON.stringify(scorecardsMulti.slice(0, 10), null, 2));
}

console.log('\n=== ADVISOR NAME SAMPLE IN CALLS / SCORECARDS / CLIENTS ===');
const advCalls = db.prepare("SELECT DISTINCT caller_name, advisor_name, dealer FROM calls LIMIT 20").all();
console.log('Calls advisors:', advCalls);

const clients = db.prepare("SELECT * FROM clients LIMIT 5").all();
console.log('Clients sample:', clients);

const clientCols = db.prepare("PRAGMA table_info(clients)").all();
console.log('Clients schema:', clientCols);

const advisors = db.prepare("SELECT * FROM advisors LIMIT 5").all();
console.log('Advisors table sample:', advisors);
