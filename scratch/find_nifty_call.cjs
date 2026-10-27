const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT c.id, c.caller_id, c.calling_number, c.client_code, c.classification, c.call_type, c.storage_path,
         t.symbol, t.quantity, t.price, t.client
  FROM calls c 
  LEFT JOIN trades t ON c.matched_trade_id = t.id 
  WHERE c.caller_id LIKE '%1791175662%' OR c.recording_url LIKE '%1791175662%'
`).all();

console.log('Call with 1791175662:', rows);
