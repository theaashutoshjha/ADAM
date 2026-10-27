import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');
const sample = db.prepare('SELECT id, caller_id, source, status, created_at, updated_at FROM calls WHERE id > 4096 LIMIT 20').all();
console.table(sample);

const totalOver = db.prepare('SELECT count(*) as c FROM calls WHERE id > 4096').get();
console.log('Total calls with id > 4096:', totalOver);

// Check distinct caller_ids
const distinctOriginal = db.prepare('SELECT count(distinct caller_id) as c FROM calls WHERE id <= 4096').get();
const distinctAll = db.prepare('SELECT count(distinct caller_id) as c FROM calls').get();
console.log('Distinct caller_ids (id <= 4096):', distinctOriginal);
console.log('Distinct caller_ids (all calls):', distinctAll);
