const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT id, caller_id, duration_seconds, length(transcript) as len, substr(transcript, 1, 80) as text
  FROM calls 
  WHERE transcript IS NOT NULL AND length(trim(transcript)) > 20
`).all();

console.log('Calls with real transcripts (> 20 chars):', rows.length);
console.log('Sample:', rows.slice(0, 5));
