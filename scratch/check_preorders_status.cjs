const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const db = new DatabaseSync('.data/auditeq_production.db');

const totalCalls = db.prepare('SELECT count(*) as count FROM calls').get().count;
const totalPreOrders = db.prepare("SELECT count(*) as count FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'").get().count;
const preOrdersWithStorage = db.prepare(`
  SELECT count(*) as count FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND storage_path IS NOT NULL AND length(storage_path) > 0
`).get().count;

const preOrdersWithUrl = db.prepare(`
  SELECT count(*) as count FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND recording_url IS NOT NULL AND length(recording_url) > 0
`).get().count;

const rows = db.prepare(`
  SELECT id, storage_path FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND storage_path IS NOT NULL AND length(storage_path) > 0
`).all();

let existing = 0;
for (const r of rows) {
  if (fs.existsSync(r.storage_path)) existing++;
}

console.log('Total calls in DB:', totalCalls);
console.log('Total pre-order calls in DB:', totalPreOrders);
console.log('Pre-order calls with recording_url:', preOrdersWithUrl);
console.log('Pre-order calls with storage_path in DB:', preOrdersWithStorage);
console.log('Pre-order calls with audio file on disk:', existing);

const samplePreOrders = db.prepare(`
  SELECT id, caller_id, calling_number, client_code, recording_url, storage_path, classification, call_type, audit_status, transcript_status
  FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
  LIMIT 5
`).all();
console.log('Sample pre-orders:', samplePreOrders);
