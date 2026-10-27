const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT id, caller_id, recording_url, storage_path, transcript
  FROM calls
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND recording_url IS NOT NULL AND length(recording_url) > 20
`).all();

let alreadyHaveLocal = 0;
let needDownload = 0;

for (const r of rows) {
  if (r.storage_path && fs.existsSync(r.storage_path)) {
    alreadyHaveLocal++;
  } else {
    needDownload++;
  }
}

console.log('Pre-order calls with Tata URLs:', rows.length);
console.log('Already have local audio:', alreadyHaveLocal);
console.log('Need download from Tata:', needDownload);
