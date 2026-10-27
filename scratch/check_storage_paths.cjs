const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare("SELECT id, caller_id, storage_path FROM calls WHERE storage_path IS NOT NULL AND storage_path != '' LIMIT 15").all();
console.log('Sample storage paths:');
for (const r of rows) {
  console.log(r.id, r.caller_id, r.storage_path, 'Exists:', fs.existsSync(r.storage_path));
}

const totalWithPath = db.prepare("SELECT count(*) as c FROM calls WHERE storage_path IS NOT NULL AND storage_path != ''").get().c;
console.log('Total calls with non-empty storage_path:', totalWithPath);
