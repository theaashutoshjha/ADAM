import { getDatabaseConnection } from '../server/db';

const db = getDatabaseConnection();
const segCount = db.prepare('SELECT COUNT(*) as c FROM call_segments').get() as any;
console.log('Total rows in call_segments:', segCount.c);

const call773Segs = db.prepare('SELECT * FROM call_segments WHERE call_id = 2083').all();
console.log('Call 2083 segments:', call773Segs.length);

const call2193Segs = db.prepare('SELECT * FROM call_segments WHERE call_id = 2193').all();
console.log('Call 2193 segments:', call2193Segs.length);
