const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const distinctCalls = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM calls c
  JOIN trades t ON (
    c.calling_number = t.phone_number 
    OR c.calling_number = t.client_number
    OR (length(c.client_code) > 3 AND c.client_code = t.client)
  )
`).get().count;

console.log('Distinct calls matching trades:', distinctCalls);

const allPreOrders = db.prepare(`
  SELECT COUNT(*) as count FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).get().count;
console.log('Calls currently flagged as PRE_ORDER:', allPreOrders);

const nonPreOrdersMatching = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM calls c
  JOIN trades t ON (
    c.calling_number = t.phone_number 
    OR c.calling_number = t.client_number
    OR (length(c.client_code) > 3 AND c.client_code = t.client)
  )
  WHERE (c.classification IS NULL OR c.classification != 'PRE_ORDER')
    AND (c.call_type IS NULL OR c.call_type != 'pre_order')
`).get().count;
console.log('Distinct calls matching trades that are NOT currently flagged as PRE_ORDER:', nonPreOrdersMatching);
