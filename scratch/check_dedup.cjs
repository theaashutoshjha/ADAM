const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

db.prepare('DELETE FROM scorecards WHERE id NOT IN (SELECT MAX(id) FROM scorecards GROUP BY call_id)').run();
db.prepare('DELETE FROM audits WHERE id NOT IN (SELECT audit_id FROM scorecards)').run();
db.prepare("DELETE FROM scorecards WHERE call_id NOT IN (SELECT id FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order')").run();
db.prepare("DELETE FROM audits WHERE call_id NOT IN (SELECT id FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order')").run();

console.log('Scorecards count after dedup:', db.prepare('SELECT count(*) as c FROM scorecards').get());
console.log('Audits count after dedup:', db.prepare('SELECT count(*) as c FROM audits').get());

const missing = db.prepare(`
  SELECT c.id, c.customer_number, c.calling_number, c.transcript 
  FROM calls c 
  LEFT JOIN scorecards s ON c.id = s.call_id 
  WHERE (c.classification = 'PRE_ORDER' OR c.call_type = 'pre_order') AND s.id IS NULL
`).all();

console.log('Pre-order calls missing scorecards count:', missing.length);
if (missing.length > 0) {
  console.log('Missing call IDs:', missing.map(m => m.id));
}
