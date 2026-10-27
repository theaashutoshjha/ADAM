const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
const rows = db.prepare("SELECT c.id, c.classification, c.call_type FROM calls c WHERE (c.classification = 'PRE_ORDER' OR c.call_type = 'pre_order')").all();
console.log('Pre-order calls count matching API query:', rows.length);
