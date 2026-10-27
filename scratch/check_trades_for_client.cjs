const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const trades = db.prepare(`
  SELECT * FROM trades 
  WHERE client = 'WIA83655' 
     OR phone_number LIKE '%9596892929%'
     OR client_number LIKE '%9596892929%'
`).all();

console.log('Trades for WIA83655:', trades);
