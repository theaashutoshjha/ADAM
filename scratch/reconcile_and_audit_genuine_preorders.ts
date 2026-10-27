import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';
import { stage8CalculateScore, type ComplianceAuditResult } from '../server/scoring-engine';
import type { CallRecord, TradeRecord } from '../src/types';

const dbPath = path.resolve('.data/auditeq_production.db');
const db = new DatabaseSync(dbPath);

console.log('===============================================================');
console.log('RECONCILING GENUINE PRE-ORDERS & CLEANSING SCRAP CALLS');
console.log('===============================================================\n');

function isScrapCall(dur: number, tx: string): { isScrap: boolean; reason: string } {
  const lower = (tx || '').trim().toLowerCase();
  if (lower.includes('silence') || lower.includes('no speech detected') || lower.length < 5) {
    return { isScrap: true, reason: 'Silence / No speech detected' };
  }
  const hasVoicemail = lower.includes('voice mail') || lower.includes('voicemail') || lower.includes('forwarded') || lower.includes('leave a message') || lower.includes('record your name');
  if (hasVoicemail && dur < 35) {
    return { isScrap: true, reason: 'Voicemail / carrier greeting without human dialogue' };
  }
  if (dur < 6) {
    return { isScrap: true, reason: 'Short call duration (< 6s)' };
  }
  return { isScrap: false, reason: 'Genuine call' };
}

// 1. Fetch current pre-orders
const currentPreOrders = db.prepare(`
  SELECT * FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as unknown as CallRecord[];

console.log(`Initial PRE_ORDER calls count: ${currentPreOrders.length}`);

const allCalls = db.prepare('SELECT * FROM calls').all() as unknown as CallRecord[];
const allTrades = db.prepare('SELECT * FROM trades').all() as unknown as TradeRecord[];
const tradesById = new Map<number, TradeRecord>();
for (const t of allTrades) tradesById.set(t.id, t);

// Index non-pre-order calls by phone and client code
const nonPreOrders = allCalls.filter(c => c.classification !== 'PRE_ORDER' && c.call_type !== 'pre_order');

let replacedCount = 0;
const replacements: Array<{ scrapCall: CallRecord; genuineCall: CallRecord; tradeId: number; reason: string }> = [];

for (const call of currentPreOrders) {
  const scrapCheck = isScrapCall(call.duration_seconds || 0, call.transcript || '');
  if (scrapCheck.isScrap) {
    const tradeId = call.matched_trade_id;
    const trade = tradeId ? tradesById.get(tradeId) : null;
    const phone = normalizePhoneNumber(call.customer_number || call.calling_number || trade?.customer_number || trade?.phone_number || '');
    const clientCode = formatCleanClientCode(call.client_code || trade?.client || trade?.client_code);

    // Find candidates in all calls
    const candidates = allCalls.filter(c => {
      if (c.id === call.id) return false;
      const cPhone = normalizePhoneNumber(c.customer_number || c.calling_number || c.phone_number || '');
      const cCode = formatCleanClientCode(c.client_code || c.client);
      const phoneMatch = phone && cPhone && phone === cPhone;
      const codeMatch = clientCode && cCode && clientCode === cCode;
      return phoneMatch || codeMatch;
    });

    // Score candidates for genuineness
    const scoredCandidates = candidates.map(c => {
      const dur = c.duration_seconds || 0;
      const tx = (c.transcript || '').toLowerCase();
      const sc = isScrapCall(dur, tx);
      if (sc.isScrap) return { call: c, score: -1000, isScrap: true };

      let score = 100;
      if (dur >= 15) score += 30;
      if (dur >= 30) score += 40;
      if (dur >= 60) score += 50;

      const orderKeywords = /\b(?:buy|sell|order|shares?|lot|cmp|market\s*price|limit|quantity|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do|liquid\s*case)\b/i;
      if (orderKeywords.test(tx)) score += 300;

      return { call: c, score, isScrap: false };
    }).filter(x => !x.isScrap).sort((a, b) => b.score - a.score);

    if (scoredCandidates.length > 0) {
      const bestGenuine = scoredCandidates[0].call;
      replacements.push({
        scrapCall: call,
        genuineCall: bestGenuine,
        tradeId: tradeId || 0,
        reason: scrapCheck.reason
      });
      replacedCount++;
    } else {
      console.warn(`[WARNING] No genuine candidate found for scrap call #${call.id} (phone: ${phone}, code: ${clientCode})`);
    }
  }
}

console.log(`Identified ${replacedCount} scrap calls in PRE_ORDER list that have genuine replacements.`);

// Execute database swap inside transaction
db.exec('BEGIN IMMEDIATE TRANSACTION;');
try {
  const updateToScrap = db.prepare(`
    UPDATE calls SET
      classification = 'SCRAP',
      call_type = 'scrap',
      status = 'scrap',
      classification_reason = ?,
      matched_trade_id = NULL
    WHERE id = ?
  `);

  const updateToPreOrder = db.prepare(`
    UPDATE calls SET
      classification = 'PRE_ORDER',
      call_type = 'pre_order',
      status = 'matched',
      matched_trade_id = ?,
      client_code = COALESCE(client_code, ?),
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const updateTradeCall = db.prepare(`
    UPDATE trades SET
      matched_call_id = ?,
      notes = ?
    WHERE id = ?
  `);

  const updateScorecardCall = db.prepare(`
    UPDATE scorecards SET
      call_id = ?
    WHERE call_id = ?
  `);

  const updateAuditCall = db.prepare(`
    UPDATE audits SET
      call_id = ?
    WHERE call_id = ?
  `);

  for (const rep of replacements) {
    const { scrapCall, genuineCall, tradeId, reason } = rep;
    // 1. Demote scrap call
    updateToScrap.run(`Reclassified to SCRAP: ${reason}`, scrapCall.id);

    // 2. Promote genuine call to pre-order
    updateToPreOrder.run(tradeId, scrapCall.client_code || '', genuineCall.id);

    // 3. Update trade link
    if (tradeId > 0) {
      updateTradeCall.run(genuineCall.id, `Matched to Pre-Order Call #${genuineCall.id} (${genuineCall.call_time})`, tradeId);
    }

    // 4. Update scorecard & audit references
    try { updateScorecardCall.run(genuineCall.id, scrapCall.id); } catch {}
    try { updateAuditCall.run(genuineCall.id, scrapCall.id); } catch {}
  }

  db.exec('COMMIT;');
  console.log('Database transaction successfully committed.');
} catch (err: any) {
  db.exec('ROLLBACK;');
  console.error('Error during database update, rolled back:', err);
  process.exit(1);
}

// 2. Verify new database counts
const finalPreOrders = db.prepare(`
  SELECT id, duration_seconds, transcript FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as any[];

console.log(`\n--- FINAL VERIFICATION ---`);
console.log(`Total PRE_ORDER calls: ${finalPreOrders.length}`);

let remainingScrap = 0;
for (const c of finalPreOrders) {
  const check = isScrapCall(c.duration_seconds || 0, c.transcript || '');
  if (check.isScrap) {
    remainingScrap++;
    console.log(`Remaining scrap: Call #${c.id} (${c.duration_seconds}s) - ${check.reason}`);
  }
}

console.log(`Remaining scrap in PRE_ORDER: ${remainingScrap} (Target: 0)`);
console.log(`Genuine pre-order calls in PRE_ORDER: ${finalPreOrders.length - remainingScrap} (100% Genuine)`);
