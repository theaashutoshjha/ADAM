const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const db = new DatabaseSync('.data/auditeq_production.db');

const pending = db.prepare(`
  SELECT id, caller_id, storage_path, recording_url, transcript
  FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND status = 'pending'
`).all();

let hasLocalFile = 0;
let hasTranscript = 0;
for (const p of pending) {
  if (p.storage_path && fs.existsSync(p.storage_path)) hasLocalFile++;
  if (p.transcript && p.transcript.trim().length > 0) hasTranscript++;
}

console.log('Pending calls count:', pending.length);
console.log('Pending calls with local audio files:', hasLocalFile);
console.log('Pending calls with transcript:', hasTranscript);
