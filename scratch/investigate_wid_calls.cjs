const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Let's pick client WID56889 or WIA12276
// Find trade phone number for WID56889
const widTrades = db.prepare(`
  SELECT id, client, client_number, trade_date, trade_time, symbol, quantity, price
  FROM trades
  WHERE client = 'WID56889'
  ORDER BY trade_date, trade_time
`).all();

console.log(`Found ${widTrades.length} trades for WID56889:`);
widTrades.slice(0, 5).forEach(t => {
  console.log(`Trade #${t.id} [${t.trade_date} ${t.trade_time || t.order_timestamp}]: ${t.symbol} qty=${t.quantity} price=${t.price} phone=${t.client_number}`);
});

const clientPhone = widTrades[0].client_number;
const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);

console.log(`\nClient phone for WID56889: ${cleanPhone}`);

// Find ALL calls with this phone number in the calls table (across all 4,096 calls)
const allCallsForPhone = db.prepare(`
  SELECT id, call_date, call_time, duration_seconds, classification, call_type, matched_trade_id, transcript
  FROM calls
  WHERE replace(replace(replace(phone_number, ' ', ''), '-', ''), '+91', '') LIKE '%${cleanPhone}%'
     OR replace(replace(replace(calling_number, ' ', ''), '-', ''), '+91', '') LIKE '%${cleanPhone}%'
  ORDER BY call_date, call_time
`).all();

console.log(`Total calls found in calls table for phone ${cleanPhone}: ${allCallsForPhone.length}`);
allCallsForPhone.slice(0, 15).forEach(c => {
  const tr = (c.transcript || '').replace(/\n/g, ' ').slice(0, 100);
  console.log(`Call #${c.id} [${c.call_date} ${c.call_time}] Dur: ${c.duration_seconds}s, Type: ${c.call_type}, MatchedTrade: ${c.matched_trade_id}: "${tr}"`);
});
