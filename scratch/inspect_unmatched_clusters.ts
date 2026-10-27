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

let noCallOnSameDate = 0;
let callOnSameDateAfterTrade = 0;
const afterGaps: number[] = [];

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

  if (!inPhoneSet) continue;

  const cDate = normalizeDateToStandard(c.trade_date);
  const cTime = c.start_seconds;

  const sameDayCalls = clientCalls.filter(call => normalizeDateToStandard(call.call_date) === cDate);
  if (sameDayCalls.length === 0) {
    noCallOnSameDate++;
  } else {
    const priorCalls = sameDayCalls.filter(call => parseTradeSecondsFromMidnight(call.call_time, call.call_date) <= cTime + 60);
    if (priorCalls.length === 0) {
      callOnSameDateAfterTrade++;
      for (const call of sameDayCalls) {
        const diff = parseTradeSecondsFromMidnight(call.call_time, call.call_date) - cTime;
        afterGaps.push(diff);
      }
    }
  }
}

console.log({
  totalTargetPreOrders: summary.clusters.length - 296, // 1177
  noCallOnSameDate,
  callOnSameDateAfterTrade,
  afterGapsSample: afterGaps.slice(0, 15)
});
