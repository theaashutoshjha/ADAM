import { DatabaseSync } from 'node:sqlite';
import { getPreOrdersAnalysisFromDb, extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');
const analysis = getPreOrdersAnalysisFromDb(db as any);
const targetClusters = analysis.clusters.filter((c: any) => c.match_status !== 'CONFIRMED_VIA_MAIL');

console.log('Total target clusters (pre-orders):', targetClusters.length);

// Load all calls
const allCalls = db.prepare('SELECT id, caller_id, call_date, call_time, duration_seconds, customer_number, calling_number, client_code, transcript FROM calls').all() as any[];

// Map calls by phone and by client_code and date
const callsByPhoneDate = new Map<string, any[]>();
const callsByClientDate = new Map<string, any[]>();
const allCallsByPhone = new Map<string, any[]>();

for (const c of allCalls) {
  const cDate = normalizeDateToStandard(c.call_date);
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number);
  for (const k of pKeys) {
    const pdKey = `${k}__${cDate}`;
    if (!callsByPhoneDate.has(pdKey)) callsByPhoneDate.set(pdKey, []);
    callsByPhoneDate.get(pdKey)!.push(c);

    if (!allCallsByPhone.has(k)) allCallsByPhone.set(k, []);
    allCallsByPhone.get(k)!.push(c);
  }
  if (c.client_code) {
    const cdKey = `${c.client_code.trim().toUpperCase()}__${cDate}`;
    if (!callsByClientDate.has(cdKey)) callsByClientDate.set(cdKey, []);
    callsByClientDate.get(cdKey)!.push(c);
  }
}

// Let's inspect for each target cluster:
// 1. Are there calls on the SAME date before cluster start_time?
// 2. How many distinct calls exist on the same date for these clients?
const availableCallsSameDate = new Set<number>();
const availableCallsBeforeTrade = new Set<number>();
let clustersWithPriorCallSameDate = 0;
let clustersWithNoPriorCallSameDate = 0;

for (const cluster of targetClusters) {
  const cDate = normalizeDateToStandard(cluster.trade_date);
  const pKeys = extractCleanPhoneKeys(cluster.phone_number);
  const cClient = (cluster.client_code || '').trim().toUpperCase();
  const tSec = cluster.start_seconds;

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

  for (const c of candidateCalls) {
    availableCallsSameDate.add(c.id);
  }

  // Filter prior calls (call_time <= trade_time + 60s)
  const priorCalls = candidateCalls.filter(c => {
    const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
    return cSec <= tSec + 60; // call occurred before or up to 60s tolerance of trade
  });

  for (const c of priorCalls) {
    availableCallsBeforeTrade.add(c.id);
  }

  if (priorCalls.length > 0) {
    clustersWithPriorCallSameDate++;
  } else {
    clustersWithNoPriorCallSameDate++;
  }
}

console.log('Unique calls on SAME date for these cluster clients:', availableCallsSameDate.size);
console.log('Unique calls on SAME date BEFORE trade execution:', availableCallsBeforeTrade.size);
console.log('Clusters with >= 1 prior call on same date:', clustersWithPriorCallSameDate);
console.log('Clusters with 0 prior calls on same date:', clustersWithNoPriorCallSameDate);
