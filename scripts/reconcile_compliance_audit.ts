import { DatabaseSync } from 'node:sqlite';
import { detectScrapCall } from '../server/classifier.js';
import { ensureScorecardsForMatchedCalls } from '../server/pipeline/reconciliation.js';
import { normalizeFinancialTranscript } from '../server/asr-engine.js';

const dbPath = '.data/auditeq_production.db';
const db = new DatabaseSync(dbPath);

console.log('=== STEP 1: FIX DATABASE INDEXES ===');
try {
  db.exec('DROP INDEX IF EXISTS uq_scorecards_resolved_trade;');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scorecards_resolved_trade
    ON scorecards(resolved_trade_id)
    WHERE resolved_trade_id IS NOT NULL AND resolved_trade_id > 0;
  `);
  console.log('Successfully dropped uq_scorecards_resolved_trade and created idx_scorecards_resolved_trade.');
} catch (err: any) {
  console.error('Error modifying index:', err?.message);
}

console.log('\n=== STEP 2: RECLASSIFY NON-CONVERSATIONAL / VOICEMAIL CALLS AS SCRAP ===');
const targetScrapCalls = [383, 354, 352, 353, 355, 137];
for (const id of targetScrapCalls) {
  const call = db.prepare('SELECT id, canonical_call_id, duration_seconds, transcript FROM calls WHERE id = ?').get(id) as any;
  if (!call) continue;
  const scrap = detectScrapCall(call.transcript, call.duration_seconds) || {
    reason: 'Scrap call: non-conversational attempt / voicemail without two-way communication.',
    evidence: 'No two-way conversation between parties.',
  };

  db.prepare(`
    UPDATE calls SET
      classification = 'SCRAP',
      call_type = 'scrap',
      status = 'scrap',
      audit_status = 'NOT_AUDITED',
      pipeline_stage = 'SCRAP',
      trade_match_status = NULL,
      matched_trade_id = NULL,
      classification_reason = ?,
      scrap_reason = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(scrap.reason, scrap.evidence, id);

  db.prepare('DELETE FROM matches WHERE call_id = ?').run(id);
  db.prepare('DELETE FROM audits WHERE call_id = ?').run(id);
  db.prepare('DELETE FROM scorecards WHERE call_id = ?').run(id);

  console.log(`Reclassified Call #${id} [${call.canonical_call_id}] as SCRAP, cleared matches & audits.`);
}

console.log('\n=== STEP 3: NORMALIZE CALL 376 (IMAGE 3) TRANSCRIPT & SEGMENTS ===');
const call376 = db.prepare('SELECT * FROM calls WHERE id = 376').get() as any;
if (call376) {
  const normTrans = normalizeFinancialTranscript(call376.transcript);
  db.prepare(`
    UPDATE calls SET
      transcript = ?,
      classification = 'PRE_ORDER',
      call_type = 'pre_order',
      trade_match_status = 'CONFIRMED',
      matched_trade_id = 101,
      audit_status = 'AUDITED',
      status = 'audited',
      updated_at = datetime('now')
    WHERE id = 376
  `).run(normTrans);

  // Normalize segments text as well
  const segs = db.prepare('SELECT id, text FROM call_segments WHERE call_id = 376').all() as any[];
  for (const s of segs) {
    const updatedText = normalizeFinancialTranscript(s.text);
    if (updatedText !== s.text) {
      db.prepare('UPDATE call_segments SET text = ? WHERE id = ?').run(updatedText, s.id);
    }
  }
  console.log('Call 376 transcript and segments normalized successfully.');
}

console.log('\n=== STEP 4: BIND GENUINE PRE-ORDER CALLS TO TRADES ===');
// Trade 89 -> Call 351
db.prepare(`
  UPDATE calls SET
    classification = 'PRE_ORDER',
    call_type = 'pre_order',
    trade_match_status = 'CONFIRMED',
    matched_trade_id = 89,
    status = 'audited',
    audit_status = 'AUDITED',
    updated_at = datetime('now')
  WHERE id = 351
`).run();

// Trade 144 -> Call 135
db.prepare(`
  UPDATE calls SET
    classification = 'PRE_ORDER',
    call_type = 'pre_order',
    trade_match_status = 'CONFIRMED',
    matched_trade_id = 144,
    status = 'audited',
    audit_status = 'AUDITED',
    updated_at = datetime('now')
  WHERE id = 135
`).run();

console.log('\n=== STEP 5: SYNC AUDITS AND SCORECARDS ===');
const synced = ensureScorecardsForMatchedCalls(db);
console.log(`Synced ${synced} scorecards.`);

console.log('\n=== STEP 6: VERIFY FINAL COUNTS & STATUS ===');
const auditCount = (db.prepare('SELECT count(*) as c FROM audits').get() as any).c;
const scorecardCount = (db.prepare('SELECT count(*) as c FROM scorecards').get() as any).c;
console.log(`FINAL AUDIT COUNT: ${auditCount}`);
console.log(`FINAL SCORECARD COUNT: ${scorecardCount}`);
console.log(`EQUAL: ${auditCount === scorecardCount}`);

const missingAuditsWithoutScorecards = db.prepare(`
  SELECT a.id, a.call_id, a.trade_id FROM audits a WHERE a.call_id NOT IN (SELECT call_id FROM scorecards)
`).all();
console.log('Audits without scorecard:', missingAuditsWithoutScorecards);

const confirmedCalls = db.prepare(`
  SELECT count(*) as c FROM calls
  WHERE trade_match_status = 'CONFIRMED' AND matched_trade_id IS NOT NULL AND classification = 'PRE_ORDER' AND status != 'scrap'
`).get() as any;
console.log(`Total genuine confirmed pre-order calls: ${confirmedCalls.c}`);

const totalTrades = (db.prepare('SELECT count(*) as c FROM trades').get() as any).c;
const confirmedTrades = (db.prepare(`
  SELECT count(DISTINCT matched_trade_id) as c FROM calls
  WHERE trade_match_status = 'CONFIRMED' AND matched_trade_id IS NOT NULL AND classification = 'PRE_ORDER' AND status != 'scrap'
`).get() as any).c;
console.log(`Total trades in DB: ${totalTrades}`);
console.log(`Trades with confirmed pre-order call: ${confirmedTrades}`);
console.log(`Trades for Mail Confirmation page: ${totalTrades - confirmedTrades}`);
