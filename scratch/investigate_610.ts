import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

const distinctRecordings = db.prepare(`
  SELECT count(DISTINCT recording_name) as cnt 
  FROM scorecards sc 
  JOIN calls c ON sc.call_id = c.id
`).get();
console.log('Distinct recording_names in scorecards:', distinctRecordings);

const distinctCanonical = db.prepare(`
  SELECT count(DISTINCT SUBSTR(c.canonical_call_id, 1, INSTR(c.canonical_call_id || '_ord_', '_ord_') - 1)) as cnt
  FROM calls c
  WHERE c.classification = 'PRE_ORDER'
`).get();
console.log('Distinct base canonical calls:', distinctCanonical);

const countOriginalPreOrders = db.prepare(`
  SELECT count(*) as cnt FROM calls 
  WHERE classification = 'PRE_ORDER' AND canonical_call_id NOT LIKE '%_ord_%'
`).get();
console.log('Original pre-order call records (without _ord_):', countOriginalPreOrders);
