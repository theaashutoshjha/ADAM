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

const callsByPhone = new Map<string, any[]>();
for (const call of calls) {
  const pKeys = extractCleanPhoneKeys(call.customer_number || call.calling_number || call.registered_number);
  for (const pk of pKeys) {
    if (!callsByPhone.has(pk)) callsByPhone.set(pk, []);
    callsByPhone.get(pk)!.push(call);
  }
}

// For each cluster: find the real matching call strictly on the same date and before trade time
let matchedClustersCount = 0;
let missingClustersCount = 0;
let mailClustersCount = 0;
const matchedCallIds = new Set<number>();
const callToClusterCount = new Map<number, number>();

for (const c of summary.clusters) {
  const pKeys = new Set<string>();
  for (const k of extractCleanPhoneKeys(c.phone_number)) pKeys.add(k);
  for (const t of c.trades) {
    for (const k of extractCleanPhoneKeys(t.phone_number || t.client_number)) pKeys.add(k);
  }

  let inPhoneSet = false;
  let clientCalls: any[] = [];
  for (const pk of pKeys) {
    if (callsByPhone.has(pk)) {
      inPhoneSet = true;
      clientCalls.push(...callsByPhone.get(pk)!);
    }
  }

  if (!inPhoneSet) {
    mailClustersCount++;
    continue;
  }

  const cDate = normalizeDateToStandard(c.trade_date);
  const cTime = c.start_seconds;

  // Genuine Pre-Order Call: Same date, before trade time (with 60s tolerance for server clock diff)
  // Prefer call closest in time before trade, genuine duration >= 6s
  const validCalls = clientCalls.filter(call => {
    const callDate = normalizeDateToStandard(call.call_date);
    if (callDate !== cDate) return false;
    const callSec = parseTradeSecondsFromMidnight(call.call_time, call.call_date);
    return callSec <= cTime + 60; // strictly made before or at trade time
  });

  if (validCalls.length > 0) {
    // Sort by proximity to trade time (closest before trade time)
    validCalls.sort((a, b) => {
      const aSec = parseTradeSecondsFromMidnight(a.call_time, a.call_date);
      const bSec = parseTradeSecondsFromMidnight(b.call_time, b.call_date);
      const aDur = a.duration_seconds || 0;
      const bDur = b.duration_seconds || 0;
      // Bonus if dur >= 6
      const aScore = (cTime - aSec) + (aDur < 6 ? 10000 : 0);
      const bScore = (cTime - bSec) + (bDur < 6 ? 10000 : 0);
      return aScore - bScore;
    });

    const best = validCalls[0];
    matchedClustersCount++;
    matchedCallIds.add(best.id);
    callToClusterCount.set(best.id, (callToClusterCount.get(best.id) || 0) + 1);
  } else {
    // No call on that date before trade execution
    missingClustersCount++;
  }
}

console.log({
  totalClusters: summary.clusters.length,
  mailClustersCount,
  matchedClustersCount,
  missingClustersCount,
  uniquePreOrderCallsMatched: matchedCallIds.size
});
