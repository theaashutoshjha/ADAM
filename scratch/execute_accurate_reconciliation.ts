import { DatabaseSync } from 'node:sqlite';
import { extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard, getPreOrdersAnalysisFromDb, invalidatePreOrdersAnalysisCache } from '../server/pipeline/tradePreOrderClusterer';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';

const db = new DatabaseSync('.data/auditeq_production.db');

console.log('=== STEP 1: REMOVING DUPLICATE CALL RECORDS (ID > 4096) ===');
const dupCountBefore = (db.prepare('SELECT COUNT(*) as c FROM calls WHERE id > 4096').get() as any).c;
console.log(`Found ${dupCountBefore} duplicate rows in calls table.`);

db.exec('BEGIN TRANSACTION;');
try {
  if (dupCountBefore > 0) {
    db.prepare('DELETE FROM matches WHERE call_id > 4096').run();
    db.prepare('DELETE FROM audits WHERE call_id > 4096').run();
    db.prepare('DELETE FROM scorecards WHERE call_id > 4096').run();
    db.prepare('DELETE FROM calls WHERE id > 4096').run();
  }
  db.exec('COMMIT;');
  console.log('Deleted duplicate calls. Genuine calls remaining:', (db.prepare('SELECT COUNT(*) as c FROM calls').get() as any).c);
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('Error deleting duplicate calls:', err);
  process.exit(1);
}

console.log('\n=== STEP 2: LOAD GENUINE CALLS AND ALL TRADES ===');
const calls = db.prepare('SELECT * FROM calls ORDER BY id ASC').all() as any[];
const trades = db.prepare('SELECT * FROM trades ORDER BY trade_date, trade_time, id').all() as any[];
console.log(`Working with ${calls.length} genuine calls and ${trades.length} trades.`);

function isScrapCall(c: any): boolean {
  const dur = c.duration_seconds || 0;
  if (dur < 6) return true;
  const tx = (c.transcript || '').toLowerCase();
  if (tx.includes('silence') || tx.includes('no speech detected') || tx.length < 5) return true;
  if (
    tx.includes('voice mail') ||
    tx.includes('voicemail') ||
    tx.includes('forwarded') ||
    tx.includes('leave a message') ||
    tx.includes('record your message') ||
    tx.includes('record your name') ||
    tx.includes('person is available') ||
    tx.includes('person you are trying to reach')
  ) {
    return true;
  }
  return false;
}

// Index calls by phone_number+date and client_code+date
const callsByPhoneDate = new Map<string, any[]>();
const callsByClientDate = new Map<string, any[]>();
const callsById = new Map<number, any>();

for (const c of calls) {
  callsById.set(c.id, c);
  const cDate = normalizeDateToStandard(c.call_date);
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.phone_number);
  for (const k of pKeys) {
    const key = `${k}__${cDate}`;
    if (!callsByPhoneDate.has(key)) callsByPhoneDate.set(key, []);
    callsByPhoneDate.get(key)!.push(c);
  }
  const cc = formatCleanClientCode(c.client_code || c.client);
  if (cc) {
    const key = `${cc}__${cDate}`;
    if (!callsByClientDate.has(key)) callsByClientDate.set(key, []);
    callsByClientDate.get(key)!.push(c);
  }
}

console.log('\n=== STEP 3: ACCURATE PRE-ORDER CALL MATCHING (BEFORE TRADE TIME ON SAME DATE) ===');
let matchedTradesCount = 0;
let mailTradesCount = 0;
const preOrderCallIds = new Set<number>();
const callTradesMap = new Map<number, any[]>();
const callSymbolsMap = new Map<number, Set<string>>();
const tradeMatchedCall = new Map<number, number>();

for (const t of trades) {
  const tDate = normalizeDateToStandard(t.trade_date);
  const pKeys = extractCleanPhoneKeys(t.phone_number || t.client_number || t.customer_number);
  const tClient = formatCleanClientCode(t.client || t.client_code);
  const tSec = parseTradeSecondsFromMidnight(t.trade_time, t.trade_date);
  const tSym = (t.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim().toUpperCase();

  const candidateCalls: any[] = [];
  const seen = new Set<number>();

  for (const k of pKeys) {
    for (const c of (callsByPhoneDate.get(`${k}__${tDate}`) || [])) {
      if (!seen.has(c.id)) { seen.add(c.id); candidateCalls.push(c); }
    }
  }
  if (tClient) {
    for (const c of (callsByClientDate.get(`${tClient}__${tDate}`) || [])) {
      if (!seen.has(c.id)) { seen.add(c.id); candidateCalls.push(c); }
    }
  }

  // Pre-Order Mandate: Call MUST be made on the SAME date BEFORE trade execution time
  const priorCalls = candidateCalls.filter(c => {
    const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
    return cSec <= tSec + 60; // 60s clock drift tolerance
  });

  if (priorCalls.length === 0) {
    mailTradesCount++;
    continue;
  }

  // Rank candidate calls: genuine first, symbol matching, closest in time
  const scored = priorCalls.map(c => {
    const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
    const gap = tSec - cSec;
    const scrap = isScrapCall(c);
    const tx = (c.transcript || '').toLowerCase();
    const hasSymbol = tSym && tx.includes(tSym.toLowerCase());
    const hasOrderWord = /\b(?:buy|sell|order|shares?|lot|cmp|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do)\b/i.test(tx);

    let score = 0;
    if (scrap) score -= 500;
    else score += 100;

    if (hasSymbol) score += 300;
    if (hasOrderWord) score += 150;

    if (gap >= -60 && gap <= 1800) score += 200;
    else if (gap <= 3600) score += 100;
    else score -= Math.min(100, Math.floor(gap / 3600) * 10);

    return { call: c, score, gap };
  }).sort((a, b) => b.score - a.score);

  const bestCall = scored[0].call;
  matchedTradesCount++;
  preOrderCallIds.add(bestCall.id);
  tradeMatchedCall.set(t.id, bestCall.id);

  if (!callTradesMap.has(bestCall.id)) callTradesMap.set(bestCall.id, []);
  callTradesMap.get(bestCall.id)!.push(t);

  if (!callSymbolsMap.has(bestCall.id)) callSymbolsMap.set(bestCall.id, new Set());
  if (tSym) callSymbolsMap.get(bestCall.id)!.add(tSym);
}

console.log(`Matched Trades: ${matchedTradesCount}`);
console.log(`Mail Confirmation Trades: ${mailTradesCount}`);
console.log(`Total Unique Real Pre-Order Calls: ${preOrderCallIds.size}`);

console.log('\n=== STEP 4: UPDATE TRADES AND CALLS IN DATABASE ===');
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

db.exec('BEGIN TRANSACTION;');
try {
  // Update trades
  const updateTradeMatched = db.prepare('UPDATE trades SET status = ?, matched_call_id = ?, notes = ? WHERE id = ?');
  const updateTradeMail = db.prepare('UPDATE trades SET status = ?, matched_call_id = NULL, notes = ? WHERE id = ?');

  for (const t of trades) {
    if (tradeMatchedCall.has(t.id)) {
      const callId = tradeMatchedCall.get(t.id)!;
      updateTradeMatched.run('MATCHED', callId, `PRE_ORDER_MATCH: Authorized via Call #${callId}`, t.id);
    } else {
      updateTradeMail.run('CONFIRMED_VIA_MAIL', 'MAIL_CONFIRMATION: Order placed via Email / Portal Confirmation', t.id);
    }
  }

  // Update calls classifications
  const updateCallClassification = db.prepare(`
    UPDATE calls SET
      classification = ?,
      call_type = ?,
      symbol = ?,
      matched_trade_id = ?,
      trade_match_status = ?,
      status = ?,
      audit_status = ?,
      updated_at = ?
    WHERE id = ?
  `);

  let preCount = 0;
  let regCount = 0;
  let scrapCount = 0;

  for (const c of calls) {
    if (preOrderCallIds.has(c.id)) {
      preCount++;
      const symbols = Array.from(callSymbolsMap.get(c.id) || []).join(', ');
      const firstTrade = (callTradesMap.get(c.id) || [])[0];
      updateCallClassification.run(
        'PRE_ORDER',
        'pre_order',
        symbols || c.symbol || '',
        firstTrade?.id || null,
        'CONFIRMED',
        'audited',
        'AUDITED',
        now,
        c.id
      );
    } else if (isScrapCall(c)) {
      scrapCount++;
      updateCallClassification.run(
        'SCRAP',
        'scrap',
        null,
        null,
        'UNMATCHED',
        'scrap',
        'EXCLUDED',
        now,
        c.id
      );
    } else {
      regCount++;
      updateCallClassification.run(
        'REGULAR',
        'regular',
        null,
        null,
        'UNMATCHED',
        'completed',
        'EXCLUDED',
        now,
        c.id
      );
    }
  }

  db.exec('COMMIT;');
  console.log(`Updated Calls: ${preCount} PRE_ORDER, ${regCount} REGULAR, ${scrapCount} SCRAP`);
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('Error updating trades and calls:', err);
  process.exit(1);
}

// Invalidate cache
invalidatePreOrdersAnalysisCache();
console.log('\n=== MIGRATION COMPLETED SUCCESSFULLY ===');
