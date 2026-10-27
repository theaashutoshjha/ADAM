const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const withoutTx = db.prepare(`
  SELECT count(*) as count FROM scorecards sc 
  JOIN calls c ON sc.call_id = c.id 
  WHERE c.transcript IS NULL OR length(trim(c.transcript)) = 0
`).get().count;

const withTx = db.prepare(`
  SELECT count(*) as count FROM scorecards sc 
  JOIN calls c ON sc.call_id = c.id 
  WHERE c.transcript IS NOT NULL AND length(trim(c.transcript)) > 0
`).get().count;

console.log({ withoutTx, withTx });

// Check how many calls in the entire database have transcripts:
const totalTx = db.prepare("SELECT count(*) as count FROM calls WHERE transcript IS NOT NULL AND length(trim(transcript)) > 0").get().count;
console.log('Total calls with transcripts in database:', totalTx);
