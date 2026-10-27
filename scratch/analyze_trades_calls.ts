import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

const tradesSample = db.prepare('SELECT * FROM trades LIMIT 3').all();
console.log('Trades sample columns:', Object.keys(tradesSample[0] || {}));
console.log('Trade sample:', tradesSample[0]);

const callsSample = db.prepare('SELECT * FROM calls LIMIT 3').all();
console.log('Calls sample columns:', Object.keys(callsSample[0] || {}));
console.log('Call sample:', callsSample[0]);

// Check trades with phone numbers, client codes, dates, times
const tradeStats = db.prepare(`
  SELECT 
    COUNT(*) as total_trades,
    COUNT(DISTINCT client) as unique_clients,
    COUNT(DISTINCT phone_number) as unique_trade_phones,
    COUNT(CASE WHEN phone_number IS NOT NULL AND length(phone_number) > 5 THEN 1 END) as trades_with_phone
  FROM trades
`).get();
console.log('Trade stats:', tradeStats);

// Check calls with phone numbers, client codes, dates, times
const callStats = db.prepare(`
  SELECT 
    COUNT(*) as total_calls,
    COUNT(DISTINCT client_code) as unique_client_codes,
    COUNT(DISTINCT customer_number) as unique_customer_phones,
    COUNT(CASE WHEN customer_number IS NOT NULL AND length(customer_number) > 5 THEN 1 END) as calls_with_customer_phone,
    COUNT(CASE WHEN transcript IS NOT NULL AND length(trim(transcript)) > 10 THEN 1 END) as transcribed_calls
  FROM calls
`).get();
console.log('Call stats:', callStats);
