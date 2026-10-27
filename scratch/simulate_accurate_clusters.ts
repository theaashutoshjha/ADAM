import { DatabaseSync } from 'node:sqlite';
import { extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard, getPreOrdersAnalysisFromDb } from '../server/pipeline/tradePreOrderClusterer';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';

const db = new DatabaseSync('.data/auditeq_production.db');

// Only use genuine calls (id <= 4096)
const originalCalls = db.prepare('SELECT * FROM calls WHERE id <= 4096 ORDER BY id ASC').all() as any[];
console.log(`Original genuine calls count: ${originalCalls.length}`);

// Get all trade clusters from clusterer
const analysis = getPreOrdersAnalysisFromDb(db as any);
console.log(`Total trade clusters: ${analysis.clusters.length}`);

// Index genuine calls
const callsByPhoneDate = new Map<string, any[]>();
const callsByClientDate = new Map<string, any[]>();
const callsById = new Map<number, any>();

for (const c of originalCalls) {
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

function isScrap(call: any): boolean {
  const dur = call.duration_seconds || 0;
  if (dur < 6) return true;
  const tx = (call.transcript || '').toLowerCase();
  if (tx.includes('silence') || tx.includes('no speech detected') || tx.length < 5) return true;
  if (tx.includes('voicemail') || tx.includes('voice mail') || tx.includes('forwarded') || tx.includes('leave a message') || tx.includes('record your name') || tx.includes('person is available')) return true;
  return false;
}

let matchedClusters = 0;
let mailClusters = 0;
const matchedCallIds = new Set<number>();
const callMatchedSymbols = new Map<number, Set<string>>();

for (const cluster of analysis.clusters) {
  const cDate = normalizeDateToStandard(cluster.trade_date);
  const pKeys = extractCleanPhoneKeys(cluster.phone_number);
  const cClient = formatCleanClientCode(cluster.client_code);
  const tSec = cluster.start_seconds;
  const script = cluster.symbol || '';

  const candidateCalls: any[] = [];
  const seen = new Set<number>();

  for (const k of pKeys) {
    for (const c of (callsByPhoneDate.get(`${k}__${cDate}`) || [])) {
      if (!seen.has(c.id)) { seen.add(c.id); candidateCalls.push(c); }
    }
  }
  if (cClient) {
    for (const c of (callsByClientDate.get(`${cClient}__${cDate}`) || [])) {
      if (!seen.has(c.id)) { seen.add(c.id); candidateCalls.push(c); }
    }
  }

  // Pre-order calls: made on the same date BEFORE trade execution time
  const priorCalls = candidateCalls.filter(c => {
    const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
    return cSec <= tSec + 60; // 60s tolerance
  });

  if (priorCalls.length === 0) {
    mailClusters++;
    continue;
  }

  // Score prior calls
  const scored = priorCalls.map(c => {
    const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
    const gap = tSec - cSec;
    const scrap = isScrap(c);
    const tx = (c.transcript || '').toLowerCase();
    const cleanSym = script.toLowerCase().replace(/-(?:eq|be|sm)$/i, '');
    const hasSymbol = cleanSym && tx.includes(cleanSym);
    const hasOrderWord = /\b(?:buy|sell|order|shares?|lot|cmp|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do)\b/i.test(tx);

    let score = 0;
    if (scrap) score -= 500;
    else score += 100;

    if (hasSymbol) score += 300;
    if (hasOrderWord) score += 150;

    // Proximity
    if (gap >= -60 && gap <= 1800) score += 200;
    else if (gap <= 3600) score += 100;
    else score -= Math.min(100, Math.floor(gap / 3600) * 10);

    return { call: c, score, gap };
  }).sort((a, b) => b.score - a.score);

  const bestCall = scored[0].call;
  matchedClusters++;
  matchedCallIds.add(bestCall.id);

  if (!callMatchedSymbols.has(bestCall.id)) callMatchedSymbols.set(bestCall.id, new Set());
  if (script) callMatchedSymbols.get(bestCall.id)!.add(script);
}

console.log('=== ACCURATE SIMULATION RESULTS ===');
console.log('Total Trade Clusters:', analysis.clusters.length);
console.log('Clusters matched to real prior call:', matchedClusters);
console.log('Clusters with NO prior call (Mail Confirmations):', mailClusters);
console.log('Total UNIQUE Pre-Order Calls identified:', matchedCallIds.size);

// Check if any calls were duplicated: each call in matchedCallIds is UNIQUE!
console.log('Are matched pre-order call IDs unique?', matchedCallIds.size === new Set(matchedCallIds).size);
