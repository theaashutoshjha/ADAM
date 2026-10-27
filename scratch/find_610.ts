import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

// Let's test different queries to see which one returns 610:
console.log('calls where call_type=pre_order:', db.prepare("SELECT count(*) as cnt FROM calls WHERE call_type = 'pre_order'").get());
console.log('calls where classification=PRE_ORDER:', db.prepare("SELECT count(*) as cnt FROM calls WHERE classification = 'PRE_ORDER'").get());
console.log('calls where call_type=pre_order or classification=PRE_ORDER:', db.prepare("SELECT count(*) as cnt FROM calls WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER'").get());

console.log('audits count:', db.prepare("SELECT count(*) as cnt FROM audits").get());
console.log('scorecards count:', db.prepare("SELECT count(*) as cnt FROM scorecards").get());

// Look at calls table:
const counts = db.prepare(`
  SELECT call_type, classification, count(*) as cnt
  FROM calls
  GROUP BY call_type, classification
`).all();
console.log('Calls breakdown:', counts);
