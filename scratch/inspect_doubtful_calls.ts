import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';
import type { CallRecord, TradeRecord } from '../src/types';

const dbPath = path.resolve('.data/auditeq_production.db');
const db = new DatabaseSync(dbPath);

console.log('=== INSPECTING THE 23 DOUBTFUL / SUPPORT CALLS ===');

const suspiciousIds = [
  2797, 28, 50, 98, 124, 194
];

// Let's get all 23 doubtful / support call IDs
const preOrders = db.prepare(`
  SELECT id, caller_id, customer_number, calling_number, call_time, duration_seconds, 
         classification, call_type, status, matched_trade_id, client_code, transcript
  FROM calls 
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as any[];

const tradingKeywords = /\b(?:buy|sell|order|shares?|lot|cmp|market\s*price|limit|quantity|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do|liquid\s*case|option|strike|put|call\s*option|target|stoploss|square\s*off|exit|position)\b/i;

const doubtfulList: any[] = [];
for (const call of preOrders) {
  const dur = call.duration_seconds || 0;
  const tx = (call.transcript || '').trim();
  const lower = tx.toLowerCase();
  const hasTradeKeywords = tradingKeywords.test(lower);
  if (!hasTradeKeywords && dur < 25) {
    doubtfulList.push(call);
  } else if (call.id === 2797) {
    doubtfulList.push(call);
  }
}

console.log(`Total doubtful / non-explicit calls found: ${doubtfulList.length}`);

const allCalls = db.prepare('SELECT * FROM calls').all() as unknown as CallRecord[];
const allTrades = db.prepare('SELECT * FROM trades').all() as unknown as TradeRecord[];
const tradesById = new Map<number, TradeRecord>();
for (const t of allTrades) tradesById.set(t.id, t);

let hasBetterCandidateCount = 0;
const improvements: any[] = [];

for (const call of doubtfulList) {
  const trade = call.matched_trade_id ? tradesById.get(call.matched_trade_id) : null;
  const p = normalizePhoneNumber(call.customer_number || call.calling_number || trade?.customer_number || trade?.phone_number || '');
  const u = formatCleanClientCode(call.client_code || trade?.client || trade?.client_code);

  // Find other candidate calls for this client
  const candidates = allCalls.filter(c => {
    if (c.id === call.id) return false;
    const cPhone = normalizePhoneNumber(c.customer_number || c.calling_number || c.phone_number || '');
    const cCode = formatCleanClientCode(c.client_code || c.client);
    return (p && cPhone && p === cPhone) || (u && cCode && u === cCode);
  });

  // Check if any candidate has explicit trade keywords and longer duration
  const betterCandidates = candidates.filter(c => {
    const dur = c.duration_seconds || 0;
    const tx = (c.transcript || '').toLowerCase();
    const hasScrap = tx.includes('silence') || tx.includes('no speech') || tx.includes('voicemail') || tx.includes('forwarded');
    return dur >= 15 && !hasScrap && tradingKeywords.test(tx);
  }).sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0));

  if (betterCandidates.length > 0) {
    hasBetterCandidateCount++;
    improvements.push({
      currentCall: { id: call.id, dur: call.duration_seconds, time: call.call_time, snippet: call.transcript?.slice(0, 70).replace(/\n/g, ' ') },
      betterCall: { id: betterCandidates[0].id, dur: betterCandidates[0].duration_seconds, time: betterCandidates[0].call_time, class: betterCandidates[0].classification, snippet: betterCandidates[0].transcript?.slice(0, 70).replace(/\n/g, ' ') },
      tradeId: call.matched_trade_id
    });
  } else {
    console.log(`[NO ALTERNATIVE] Call #${call.id} (dur: ${call.duration_seconds}s, time: ${call.call_time}) is the only call for client ${u || p}: "${call.transcript?.slice(0, 60).replace(/\n/g, ' ')}"`);
  }
}

console.log(`\nDoubtful calls that have a MUCH BETTER genuine trade call in DB: ${hasBetterCandidateCount}`);
console.log('Sample Improvements:');
console.log(improvements.slice(0, 10));
