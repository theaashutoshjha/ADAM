const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const tradesTotal = db.prepare('SELECT count(*) as c FROM trades').get().c;
console.log('Total trades in db:', tradesTotal);

// Trades with phone numbers in calls
const tradesWithCallPhone = db.prepare(`
  SELECT count(*) as c FROM trades t 
  WHERE EXISTS (
    SELECT 1 FROM calls c 
    WHERE c.customer_number = t.phone_number 
       OR c.calling_number = t.phone_number 
       OR c.phone_number = t.phone_number
  )
`).get().c;
console.log('Trades matching call phone numbers:', tradesWithCallPhone);

// Trades without call phone numbers
const tradesWithoutCallPhone = tradesTotal - tradesWithCallPhone;
console.log('Trades without call phone numbers (Mail confirmations):', tradesWithoutCallPhone);

// Calls with phone numbers in trades
const callsWithTradePhone = db.prepare(`
  SELECT count(*) as c FROM calls c 
  WHERE EXISTS (
    SELECT 1 FROM trades t 
    WHERE t.phone_number = c.customer_number 
       OR t.phone_number = c.calling_number 
       OR t.phone_number = c.phone_number
  )
`).get().c;
console.log('Calls matching trade phone numbers:', callsWithTradePhone);

// Distinct client phone numbers in trades
const distinctTradePhones = db.prepare('SELECT count(DISTINCT phone_number) as c FROM trades').get().c;
console.log('Distinct client phones in trades:', distinctTradePhones);
