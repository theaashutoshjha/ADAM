const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT c.id, c.caller_id, c.storage_path, c.recording_url
  FROM calls c
  JOIN trades t ON (
    c.calling_number = t.phone_number 
    OR c.calling_number = t.client_number
    OR (length(c.client_code) > 3 AND c.client_code = t.client)
  )
  WHERE (c.classification IS NULL OR c.classification != 'PRE_ORDER')
    AND (c.call_type IS NULL OR c.call_type != 'pre_order')
  GROUP BY c.id
`).all();

console.log('Unmarked calls count:', rows.length);
let withStorage = 0;
for (const r of rows) {
  if (r.storage_path && fs.existsSync(r.storage_path)) withStorage++;
}
console.log('Unmarked calls with audio file on disk:', withStorage);
