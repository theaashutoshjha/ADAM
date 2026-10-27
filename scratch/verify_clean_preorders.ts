import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve('.data/auditeq_production.db');
const db = new DatabaseSync(dbPath);

console.log('=== VERIFYING CLEAN PRE-ORDERS & GENUINENESS ===');
const preOrders = db.prepare(`
  SELECT id, caller_id, customer_number, calling_number, call_time, duration_seconds, 
         classification, call_type, status, matched_trade_id, client_code, transcript
  FROM calls 
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as any[];

console.log(`Total pre-order calls in DB: ${preOrders.length}`);

let scrapCount = 0;
let silenceCount = 0;
let voicemailCount = 0;
let shortCount = 0;
let genuineCount = 0;

for (const call of preOrders) {
  const dur = call.duration_seconds || 0;
  const tx = (call.transcript || '').toLowerCase();
  const isSilence = tx.includes('silence') || tx.includes('no speech') || tx.trim().length < 5;
  const isVoicemail = (tx.includes('voice mail') || tx.includes('voicemail') || tx.includes('forwarded') || tx.includes('leave a message')) && dur < 35;
  const isShort = dur < 6;

  if (isSilence) silenceCount++;
  if (isVoicemail) voicemailCount++;
  if (isShort) shortCount++;

  if (isSilence || isVoicemail || isShort) {
    scrapCount++;
    console.log(`Detected scrap: Call #${call.id} (dur: ${dur}s, tx: "${tx.slice(0, 40)}...")`);
  } else {
    genuineCount++;
  }
}

console.log(`\nGenuineness Results:`);
console.log(`- Total Pre-Order Calls: ${preOrders.length}`);
console.log(`- Genuine Calls:         ${genuineCount} (${((genuineCount / preOrders.length) * 100).toFixed(1)}%)`);
console.log(`- Scrap Calls:           ${scrapCount}`);
console.log(`- Silence Calls:         ${silenceCount}`);
console.log(`- Short Voicemail Calls: ${voicemailCount}`);
console.log(`- Short (<6s) Calls:     ${shortCount}`);

// Verify Scorecard linkage
const scorecardsForPreOrders = db.prepare(`
  SELECT count(*) as c
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE (c.classification = 'PRE_ORDER' OR c.call_type = 'pre_order') AND s.is_current = 1
`).get() as any;

console.log(`- Pre-Orders with active Scorecards: ${scorecardsForPreOrders.c}`);
