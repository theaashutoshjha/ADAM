const Database = require('better-sqlite3');
const db = new Database('dev.db');

console.log('=== TABLES ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.name));

console.log('\n=== CALLS SAMPLE (first 5) ===');
try {
  const calls = db.prepare("SELECT id, caller_id, recording_name, caller_name, advisor_name, dealer, client_code, client, call_type, status, audit_status, duration_seconds FROM calls LIMIT 5").all();
  console.log(JSON.stringify(calls, null, 2));
} catch(e) { console.error(e.message); }

console.log('\n=== CALLS COUNT & DUPLICATES CHECK ===');
try {
  const totalCalls = db.prepare("SELECT COUNT(*) as count FROM calls").get();
  console.log('Total calls:', totalCalls.count);

  const dupRecordings = db.prepare(`
    SELECT recording_name, COUNT(*) as c, GROUP_CONCAT(id) as ids 
    FROM calls 
    WHERE recording_name IS NOT NULL AND recording_name != '' 
    GROUP BY recording_name 
    HAVING c > 1
  `).all();
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
  `).all();
  console.log('Duplicate caller_ids count:', dupCallerIds.length);
  if (dupCallerIds.length > 0) {
    console.log('Sample duplicate caller_ids:', JSON.stringify(dupCallerIds.slice(0, 10), null, 2));
  }
} catch(e) { console.error(e.message); }

console.log('\n=== TRADES & MULTI TRADES PER CALL ===');
try {
  const multiTrades = db.prepare(`
    SELECT matched_call_id, COUNT(*) as c, GROUP_CONCAT(id) as trade_ids, GROUP_CONCAT(symbol) as symbols 
    FROM trades 
    WHERE matched_call_id IS NOT NULL 
    GROUP BY matched_call_id 
    HAVING c > 1
  `).all();
  console.log('Calls with multiple trades:', multiTrades.length);
  if (multiTrades.length > 0) {
    console.log('Sample calls with multiple trades:', JSON.stringify(multiTrades.slice(0, 5), null, 2));
  }

  const scorecardsMulti = db.prepare(`
    SELECT call_id, COUNT(*) as c, GROUP_CONCAT(id) as sc_ids 
    FROM scorecards 
    GROUP BY call_id 
    HAVING c > 1
  `).all();
  console.log('Calls with multiple scorecards:', scorecardsMulti.length);
  if (scorecardsMulti.length > 0) {
    console.log('Sample calls with multiple scorecards:', JSON.stringify(scorecardsMulti.slice(0, 10), null, 2));
  }
} catch(e) { console.error(e.message); }

console.log('\n=== ADVISOR NAME CHECK IN CALLS / SCORECARDS / CLIENTS ===');
try {
  const advCalls = db.prepare("SELECT DISTINCT caller_name, advisor_name, dealer FROM calls LIMIT 15").all();
  console.log('Calls advisors:', advCalls);

  const advScorecards = db.prepare("SELECT DISTINCT caller_name FROM scorecards LIMIT 15").all();
  console.log('Scorecards caller_name:', advScorecards);

  const clients = db.prepare("SELECT * FROM clients LIMIT 5").all();
  console.log('Clients sample:', clients);

  const clientColumns = db.prepare("PRAGMA table_info(clients)").all();
  console.log('Clients columns:', clientColumns.map(c => c.name));

  const advisors = db.prepare("SELECT * FROM advisors LIMIT 5").all();
  console.log('Advisors sample:', advisors);
} catch(e) { console.error(e.message); }
