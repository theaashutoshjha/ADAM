const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

console.log('--- Database Verification Summary ---');
console.log('Total calls in DB:', db.prepare('SELECT count(*) as count FROM calls').get().count);
console.log('Total pre-order calls:', db.prepare("SELECT count(*) as count FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'").get().count);
console.log('Pre-orders with audio files:', db.prepare(`
  SELECT count(*) as count FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order') 
    AND storage_path IS NOT NULL AND length(storage_path) > 0
`).get().count);
console.log('Pre-orders with transcripts:', db.prepare(`
  SELECT count(*) as count FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order') 
    AND transcript IS NOT NULL AND length(transcript) > 0
`).get().count);
console.log('Total scorecards:', db.prepare(`
  SELECT count(*) as count FROM scorecards
`).get().count);
console.log('Total pre-order scorecards:', db.prepare(`
  SELECT count(*) as count FROM scorecards sc 
  JOIN calls c ON sc.call_id = c.id 
  WHERE c.classification = 'PRE_ORDER' OR c.call_type = 'pre_order'
`).get().count);

console.log('Scorecards Q3 status:');
console.log(db.prepare("SELECT q3_status, count(*) as count FROM scorecards GROUP BY q3_status").all());

console.log('Scorecards Q1-Q5 breakdown:');
console.log({
  q1: db.prepare("SELECT q1_status, count(*) as c FROM scorecards GROUP BY q1_status").all(),
  q2: db.prepare("SELECT q2_status, count(*) as c FROM scorecards GROUP BY q2_status").all(),
  q3: db.prepare("SELECT q3_status, count(*) as c FROM scorecards GROUP BY q3_status").all(),
  q4: db.prepare("SELECT q4_status, count(*) as c FROM scorecards GROUP BY q4_status").all(),
  q5: db.prepare("SELECT q5_status, count(*) as c FROM scorecards GROUP BY q5_status").all(),
});

console.log('Scorecards overall scores:');
console.log(db.prepare("SELECT score, count(*) as count FROM scorecards GROUP BY score ORDER BY score DESC").all());

console.log('Scorecards fatal vs non-fatal:');
console.log(db.prepare("SELECT is_fatal, count(*) as count FROM scorecards GROUP BY is_fatal").all());

console.log('Sample scorecards with PASS on Q3:');
console.log(db.prepare(`
  SELECT sc.id, sc.call_id, sc.score, sc.q3_status, sc.q3_evidence, c.client_code, t.symbol, t.quantity, t.price
  FROM scorecards sc
  JOIN calls c ON sc.call_id = c.id
  LEFT JOIN trades t ON sc.resolved_trade_id = t.id
  WHERE sc.q3_status = 'PASS'
  LIMIT 3
`).all());
