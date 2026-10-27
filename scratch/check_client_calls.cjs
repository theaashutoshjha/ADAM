const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT id, caller_id, calling_number, client_code, call_time, storage_path, recording_url 
  FROM calls 
  WHERE calling_number = '9840489999' OR client_code = 'WIG62920'
`).all();

console.log('Total calls for 9840489999 / WIG62920:', rows.length);
console.log(rows);
