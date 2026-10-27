const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, c.transcript, c.call_time
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL'
`).all();

const hindiFails = rows.filter(r => /[\u0900-\u097F]/.test(r.transcript || ''));
console.log('Total Hindi Fails:', hindiFails.length);

console.log('First 20 Sample Hindi Failed Transcripts:');
hindiFails.slice(0, 20).forEach(r => {
  console.log(`Call #${r.call_id} [${r.client_code}]: ${r.transcript.slice(0, 150).replace(/\n/g, ' ')}`);
});
