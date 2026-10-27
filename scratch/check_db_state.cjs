const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

console.log('=== CALLS TABLE SUMMARY ===');
const totalCalls = db.prepare('SELECT count(*) as c FROM calls').get().c;
console.log('Total calls in calls table:', totalCalls);

const callTypes = db.prepare('SELECT call_type, classification, count(*) as c FROM calls GROUP BY call_type, classification').all();
console.log('Call types & classification breakdown:', callTypes);

const preOrderCalls = db.prepare(`
  SELECT count(*) as c FROM calls 
  WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL
`).get().c;
console.log('Pre-order calls count (where call_type=pre_order OR classification=PRE_ORDER OR matched_trade_id IS NOT NULL):', preOrderCalls);

const preOrderWithTranscript = db.prepare(`
  SELECT count(*) as c FROM calls 
  WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL)
    AND transcript IS NOT NULL AND length(trim(transcript)) > 0
`).get().c;
console.log('Pre-order calls with transcript:', preOrderWithTranscript);

const preOrderPending = db.prepare(`
  SELECT count(*) as c FROM calls 
  WHERE (call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL)
    AND (transcript IS NULL OR length(trim(transcript)) = 0)
`).get().c;
console.log('Pre-order calls pending transcript:', preOrderPending);

const totalTrades = db.prepare('SELECT count(*) as c FROM trades').get().c;
console.log('Total trades in trades table:', totalTrades);

const totalScorecards = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
console.log('Total scorecards:', totalScorecards);

const totalAudits = db.prepare('SELECT count(*) as c FROM audits').get().c;
console.log('Total audits:', totalAudits);

// Let's also check trade vs call matching rule
// User rule:
// "If number exist in the both trade and call data check the time, the call made just before the trade execution time is pre-order call"
// "If number exist in trade data but not in call data = mail confirmation"
// "Calls shorter then 10 secods, or calls which is on voice mail, or call where 2 party conversation is not there are scrab calls"
console.log('\n=== TRADES VS CALLS NUMBER MATCHING ===');
const tradesWithCallPhone = db.prepare(`
  SELECT count(DISTINCT t.id) as c
  FROM trades t
  JOIN calls c ON (
    replace(replace(replace(replace(t.client_number, ' ', ''), '-', ''), '+91', ''), '91', '') =
    replace(replace(replace(replace(c.phone_number, ' ', ''), '-', ''), '+91', ''), '91', '')
    OR
    replace(replace(replace(replace(t.client_number, ' ', ''), '-', ''), '+91', ''), '91', '') =
    replace(replace(replace(replace(c.calling_number, ' ', ''), '-', ''), '+91', ''), '91', '')
  )
`).get().c;
console.log('Trades where client_number exists in calls:', tradesWithCallPhone);

const callsWithTradePhone = db.prepare(`
  SELECT count(DISTINCT c.id) as c
  FROM calls c
  JOIN trades t ON (
    replace(replace(replace(replace(t.client_number, ' ', ''), '-', ''), '+91', ''), '91', '') =
    replace(replace(replace(replace(c.phone_number, ' ', ''), '-', ''), '+91', ''), '91', '')
    OR
    replace(replace(replace(replace(t.client_number, ' ', ''), '-', ''), '+91', ''), '91', '') =
    replace(replace(replace(replace(c.calling_number, ' ', ''), '-', ''), '+91', ''), '91', '')
  )
`).get().c;
console.log('Calls whose phone number exists in trades:', callsWithTradePhone);
