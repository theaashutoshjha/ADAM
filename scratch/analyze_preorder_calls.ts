import { DatabaseSync } from 'node:sqlite';
import { extractCleanPhoneKeys, parseTradeSecondsFromMidnight } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');

const trades = db.prepare('SELECT * FROM trades ORDER BY trade_date, trade_time').all() as any[];
const calls = db.prepare('SELECT * FROM calls ORDER BY call_date, call_time').all() as any[];

console.log(`Loaded ${trades.length} trades and ${calls.length} calls.`);

// Build index of calls by phone and by client_code
const callsByPhone = new Map<string, any[]>();
const callsByClient = new Map<string, any[]>();

for (const c of calls) {
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.phone_number);
  for (const k of pKeys) {
    if (!callsByPhone.has(k)) callsByPhone.set(k, []);
    callsByPhone.get(k)!.push(c);
  }
  if (c.client_code) {
    const cc = c.client_code.trim().toUpperCase();
    if (!callsByClient.has(cc)) callsByClient.set(cc, []);
    callsByClient.get(cc)!.push(c);
  }
}

// For each trade, find calls on the same date for the client/phone that occurred BEFORE trade_time
let tradesWithCandidateCalls = 0;
let tradesWithoutCandidateCalls = 0;
const matchedCallIds = new Set<number>();
const allCandidateCallIds = new Set<number>();

for (const t of trades) {
  const tPhones = extractCleanPhoneKeys(t.phone_number || t.client_number);
  const tClient = (t.client || t.client_code || '').trim().toUpperCase();
  const tDate = t.trade_date;
  const tSec = parseTradeSecondsFromMidnight(t.trade_time, t.trade_date);

  // Find candidate calls on same date with matching phone or client
  const candidateCalls: any[] = [];
  const seenC = new Set<number>();

  for (const p of tPhones) {
    for (const c of (callsByPhone.get(p) || [])) {
      if (!seenC.has(c.id)) {
        seenC.add(c.id);
        candidateCalls.push(c);
      }
    }
  }
  if (tClient) {
    for (const c of (callsByClient.get(tClient) || [])) {
      if (!seenC.has(c.id)) {
        seenC.add(c.id);
        candidateCalls.push(c);
      }
    }
  }

  // Filter calls: same date, and call_time <= trade_time (or within same day before trade)
  const priorCalls = candidateCalls.filter(c => {
    if (c.call_date !== tDate) return false;
    const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
    // Call was before trade (allow small tolerance e.g. 60s or during same morning)
    return cSec <= tSec + 60;
  });

  for (const c of priorCalls) {
    allCandidateCallIds.add(c.id);
  }

  if (priorCalls.length > 0) {
    tradesWithCandidateCalls++;
    // Sort by proximity to trade time (closest call before trade)
    priorCalls.sort((a, b) => {
      const aSec = parseTradeSecondsFromMidnight(a.call_time, a.call_date);
      const bSec = parseTradeSecondsFromMidnight(b.call_time, b.call_date);
      return Math.abs(tSec - aSec) - Math.abs(tSec - bSec);
    });
    matchedCallIds.add(priorCalls[0].id);
  } else {
    tradesWithoutCandidateCalls++;
  }
}

console.log('Trades with candidate prior calls:', tradesWithCandidateCalls);
console.log('Trades WITHOUT candidate prior calls (e.g. Mail confirmations):', tradesWithoutCandidateCalls);
console.log('Total unique candidate calls that took place before trade execution:', allCandidateCallIds.size);
console.log('Unique closest prior calls matched 1-per-trade:', matchedCallIds.size);
