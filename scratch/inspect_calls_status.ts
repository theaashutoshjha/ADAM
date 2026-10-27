import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');
console.log('processing_status counts:', db.prepare('SELECT processing_status, count(*) as c FROM calls GROUP BY processing_status').all());
console.log('status counts:', db.prepare('SELECT status, count(*) as c FROM calls GROUP BY status').all());
console.log('classification counts:', db.prepare('SELECT classification, count(*) as c FROM calls GROUP BY classification').all());
console.log('pipeline_stage counts:', db.prepare('SELECT pipeline_stage, count(*) as c FROM calls GROUP BY pipeline_stage').all());
