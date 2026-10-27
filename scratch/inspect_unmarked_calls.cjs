const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT c.id, c.caller_id, c.calling_number, c.client_code, c.call_type, c.classification,
         t.id as trade_id, t.symbol, t.quantity, t.price, t.client as trade_client, t.phone_number as trade_phone
  FROM calls c
  JOIN trades t ON (
    c.calling_number = t.phone_number 
    OR c.calling_number = t.client_number
    OR (length(c.client_code) > 3 AND c.client_code = t.client)
  )
  WHERE (c.classification IS NULL OR c.classification != 'PRE_ORDER')
    AND (c.call_type IS NULL OR c.call_type != 'pre_order')
`).all();

console.log('Calls matching trades but NOT classified as PRE_ORDER:', rows.length);
console.log('Sample of these calls:');
console.log(rows.slice(0, 10));
