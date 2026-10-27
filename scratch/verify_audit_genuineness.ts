import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

console.log('--- CALLS TABLE SUMMARY ---');
const classSummary = db.prepare('SELECT classification, count(*) as c FROM calls GROUP BY classification').all();
console.log('Classification breakdown:', classSummary);

const typeSummary = db.prepare('SELECT call_type, count(*) as c FROM calls GROUP BY call_type').all();
console.log('Call type breakdown:', typeSummary);

console.log('\n--- SCORECARDS SUMMARY ---');
const scCount = db.prepare('SELECT count(*) as c FROM scorecards WHERE is_current = 1').get() as any;
console.log('Total scorecards (is_current=1):', scCount.c);

const q2Dist = db.prepare('SELECT q2_status, count(*) as c FROM scorecards WHERE is_current = 1 GROUP BY q2_status').all();
const q3Dist = db.prepare('SELECT q3_status, count(*) as c FROM scorecards WHERE is_current = 1 GROUP BY q3_status').all();
console.log('Q2 breakdown:', q2Dist);
console.log('Q3 breakdown:', q3Dist);

// Check if any scrap calls exist in PRE_ORDER
const preOrders = db.prepare("SELECT * FROM calls WHERE classification = 'PRE_ORDER'").all() as any[];
let scrapInPreOrder = 0;
for (const c of preOrders) {
  const dur = c.duration_seconds || 0;
  const tx = (c.transcript || '').toLowerCase();
  const isScrap = dur < 6 || tx.includes('silence / no speech') || tx.includes('forwarded to voice') || tx.includes('record your name and reason');
  if (isScrap) {
    scrapInPreOrder++;
    console.log(`WARNING: Scrap call in pre-order: Call #${c.id} (dur: ${dur}s): ${tx.slice(0, 80)}`);
  }
}
console.log(`Scrap / Voicemail calls in PRE_ORDER: ${scrapInPreOrder}`);

// Samples of Q2 and Q3 failures
const q2Fails = db.prepare("SELECT call_id, resolved_trade_id, q2_status, q2_evidence FROM scorecards WHERE is_current = 1 AND q2_status != 'PASS' LIMIT 5").all();
console.log('\nSample Q2 non-pass cases:', q2Fails);

const q3Fails = db.prepare("SELECT call_id, resolved_trade_id, q3_status, q3_evidence FROM scorecards WHERE is_current = 1 AND q3_status != 'PASS' LIMIT 5").all();
console.log('\nSample Q3 non-pass cases:', q3Fails);
