const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Let's check how trades group into clusters or pre-order analysis
const trades = db.prepare('SELECT id, client, phone_number, trade_date, symbol FROM trades').all();

// Let's group trades by client + trade_date + symbol
const groupMap = new Map();
for (const t of trades) {
  const key = `${t.client}_${t.trade_date}_${t.symbol}`;
  groupMap.set(key, (groupMap.get(key) || 0) + 1);
}
console.log('Unique trade groups (client + date + symbol):', groupMap.size);

// Group by client + date
const groupClientDate = new Map();
for (const t of trades) {
  const key = `${t.client}_${t.trade_date}`;
  groupClientDate.set(key, (groupClientDate.get(key) || 0) + 1);
}
console.log('Unique trade groups (client + date):', groupClientDate.size);

// Check distinct trade_ids in matches or mail
const matches = db.prepare('SELECT count(*) as c FROM matches').get().c;
console.log('Matches count:', matches);
