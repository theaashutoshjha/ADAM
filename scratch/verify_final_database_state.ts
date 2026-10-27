import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

console.log('--- CALLS TABLE SUMMARY ---');
const totalCalls = db.prepare('SELECT count(*) as c FROM calls').get();
const preOrders = db.prepare("SELECT count(*) as c FROM calls WHERE classification = 'PRE_ORDER'").get() as any;
const regulars = db.prepare("SELECT count(*) as c FROM calls WHERE classification = 'REGULAR'").get() as any;
const scraps = db.prepare("SELECT count(*) as c FROM calls WHERE classification = 'SCRAP'").get() as any;
console.log('Total calls:', totalCalls);
console.log(`PRE_ORDER: ${preOrders.c}, REGULAR: ${regulars.c}, SCRAP: ${scraps.c}`);

console.log('\n--- VERIFYING ZERO SCRAP IN PRE_ORDER ---');
const badInPre = db.prepare(`
  SELECT id, duration_seconds, transcript
  FROM calls
  WHERE classification = 'PRE_ORDER'
  AND (
    duration_seconds < 8
    OR length(transcript) < 30
    OR transcript LIKE '%voice mail%'
    OR transcript LIKE '%voicemail%'
    OR transcript LIKE '%forwarded%'
    OR transcript LIKE '%record your%'
    OR transcript LIKE '%silence%'
    OR transcript LIKE '%no speech%'
  )
`).all() as any[];

console.log('Any scrap / voicemail / silence in PRE_ORDER:', badInPre.length);
if (badInPre.length > 0) {
  console.log(badInPre);
} else {
  console.log('VERIFIED: Exactly 0 scrap calls in PRE_ORDER!');
}

console.log('\n--- SCORECARDS & AUDITS TABLE SUMMARY ---');
const totalScorecards = db.prepare('SELECT count(*) as c FROM scorecards').get() as any;
const currentScorecards = db.prepare('SELECT count(*) as c FROM scorecards WHERE is_current = 1').get() as any;
const totalAudits = db.prepare('SELECT count(*) as c FROM audits').get() as any;
console.log(`Total Scorecards: ${totalScorecards.c}, Current Scorecards: ${currentScorecards.c}, Total Audits: ${totalAudits.c}`);

console.log('\n--- Q1-Q5 AUDIT COMPLIANCE DISTRIBUTION ---');
for (const q of ['q1', 'q2', 'q3', 'q4', 'q5']) {
  const dist = db.prepare(`SELECT ${q}_status as status, count(*) as count FROM scorecards WHERE is_current = 1 GROUP BY ${q}_status`).all();
  console.log(`${q.toUpperCase()}:`, dist);
}
