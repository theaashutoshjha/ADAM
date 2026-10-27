import { DatabaseSync } from 'node:sqlite';
import { 
  calculatePreOrdersFromTrades, 
  normalizeDateToStandard, 
  parseTradeSecondsFromMidnight, 
  extractCleanPhoneKeys 
} from '../server/pipeline/tradePreOrderClusterer.js';

const db = new DatabaseSync('.data/auditeq_production.db');
const calls = db.prepare('SELECT * FROM calls').all() as any[];
const rawTrades = db.prepare('SELECT * FROM trades').all() as any[];
const summary = calculatePreOrdersFromTrades(rawTrades);

console.log(`Total calls in DB: ${calls.length}`);
console.log(`Total trades in DB: ${rawTrades.length}`);
console.log(`Total clusters: ${summary.clusters.length}`);

// Map calls by phone
const callsByPhone = new Map<string, any[]>();
for (const call of calls) {
  const pKeys = extractCleanPhoneKeys(call.customer_number || call.calling_number || call.registered_number);
  for (const pk of pKeys) {
    if (!callsByPhone.has(pk)) callsByPhone.set(pk, []);
    callsByPhone.get(pk)!.push(call);
  }
}

// Map calls by client code if available
const callsByUcc = new Map<string, any[]>();
for (const call of calls) {
  const ucc = (call.client_code || '').trim().toUpperCase();
  if (ucc) {
    if (!callsByUcc.has(ucc)) callsByUcc.set(ucc, []);
    callsByUcc.get(ucc)!.push(call);
  }
}

console.log(`Unique phone keys in calls: ${callsByPhone.size}`);
console.log(`Unique UCCs in calls: ${callsByUcc.size}`);

// Check all 1177 target clusters
let mailCount = 0;
let targetClusters = 0;
let clustersWithExactPriorCall = 0;
let clustersWithCallSameDayAfter = 0;
let clustersWithCallDifferentDay = 0;

const priorCallIds = new Set<number>();
const allMatchingClientCalls = new Set<number>();

for (const c of summary.clusters) {
  const pKeys = new Set<string>();
  for (const k of extractCleanPhoneKeys(c.phone_number)) pKeys.add(k);
  for (const t of c.trades) {
    for (const k of extractCleanPhoneKeys(t.phone_number || t.client_number)) pKeys.add(k);
  }

  let inMeta = false;
  let clientCalls: any[] = [];
  for (const pk of pKeys) {
    if (callsByPhone.has(pk)) {
      inMeta = true;
      for (const call of callsByPhone.get(pk)!) {
        clientCalls.push(call);
        allMatchingClientCalls.add(call.id);
      }
    }
  }

  if (!inMeta) {
    mailCount++;
    continue;
  }
  targetClusters++;

  const cDate = normalizeDateToStandard(c.trade_date);
  const cTime = c.start_seconds;

  const sameDayCalls = clientCalls.filter(call => normalizeDateToStandard(call.call_date) === cDate);
  const priorCalls = sameDayCalls.filter(call => parseTradeSecondsFromMidnight(call.call_time, call.call_date) <= cTime + 60);

  if (priorCalls.length > 0) {
    clustersWithExactPriorCall++;
    for (const call of priorCalls) priorCallIds.add(call.id);
  } else if (sameDayCalls.length > 0) {
    clustersWithCallSameDayAfter++;
  } else {
    clustersWithCallDifferentDay++;
  }
}

console.log({
  totalClusters: summary.clusters.length,
  mailCount,
  targetClusters,
  clustersWithExactPriorCall,
  clustersWithCallSameDayAfter,
  clustersWithCallDifferentDay,
  uniquePriorCallsCount: priorCallIds.size,
  totalCallsMadeByTheseClientsAcrossMonth: allMatchingClientCalls.size
});
