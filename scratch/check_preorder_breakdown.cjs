const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT status, audit_status, count(*) as count 
  FROM calls 
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
  GROUP BY status, audit_status
`).all();

console.log('Pre-order calls breakdown:', rows);
