import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));
const c = db.prepare('SELECT id, duration_seconds, transcript FROM calls WHERE id = 3659').get() as any;
console.log('Call 3659 transcript (length: ' + c.transcript?.length + '):');
console.log(c.transcript);
