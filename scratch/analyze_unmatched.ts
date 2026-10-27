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

console.log(`Loaded ${calls.length} calls and ${summary.clusters.length} clusters.`);

// Find clusters where match_status !== 'CONFIRMED_VIA_MAIL' but our matcher didn't match or where matched
const callsByPhone = new Map<string, any[]>();
for (const call of calls) {
  const pKeys = extractCleanPhoneKeys(call.customer_number || call.calling_number || call.registered_number);
  for (const pk of pKeys) {
    if (!callsByPhone.has(pk)) callsByPhone.set(pk, []);
    callsByPhone.get(pk)!.push(call);
  }
}

// Also map calls by advisor name / dealer
const callsByAdvisor = new Map<string, any[]>();
for (const call of calls) {
  const adv = (call.advisor_name || call.dealer || call.caller_name || '').toLowerCase().trim();
  if (adv) {
    if (!callsByAdvisor.has(adv)) callsByAdvisor.set(adv, []);
    callsByAdvisor.get(adv)!.push(call);
  }
}

const unmatchedClusters: any[] = [];
for (const c of summary.clusters) {
  if (c.match_status === 'CONFIRMED_VIA_MAIL') continue;

  const cDate = normalizeDateToStandard(c.trade_date);
  const cTime = c.start_seconds;

  const pKeys = new Set<string>();
  for (const k of extractCleanPhoneKeys(c.phone_number)) pKeys.add(k);
  for (const t of c.trades) {
    for (const k of extractCleanPhoneKeys(t.phone_number || t.client_number)) pKeys.add(k);
  }

  let clientCalls: any[] = [];
  for (const pk of pKeys) {
    if (callsByPhone.has(pk)) clientCalls.push(...callsByPhone.get(pk)!);
  }

  const sameDayCalls = clientCalls.filter(call => normalizeDateToStandard(call.call_date) === cDate);
  const priorCalls = sameDayCalls.filter(call => parseTradeSecondsFromMidnight(call.call_time, call.call_date) <= cTime + 60);

  if (priorCalls.length === 0) {
    unmatchedClusters.push({
      cluster_id: c.cluster_id,
      client_code: c.client_code,
      phone_number: c.phone_number,
      symbol: c.symbol,
      trade_date: c.trade_date,
      trade_time: c.start_time,
      trade_sec: cTime,
      trades_count: c.trades.length,
      advisor: c.trades[0]?.advisor_name,
      dealer: c.trades[0]?.dealer,
      sameDayCallsCount: sameDayCalls.length,
      sameDayCalls: sameDayCalls.map(sc => ({ id: sc.id, time: sc.call_time, caller_id: sc.caller_id, dur: sc.duration_seconds })),
      totalClientCallsCount: clientCalls.length,
      totalClientCallDates: Array.from(new Set(clientCalls.map(cl => cl.call_date)))
    });
  }
}

console.log(`Total target pre-order clusters: ${summary.clusters.length - 296} (1177)`);
console.log(`Unmatched target clusters: ${unmatchedClusters.length}`);
console.log('\n--- SAMPLE 10 UNMATCHED CLUSTERS ---');
console.dir(unmatchedClusters.slice(0, 10), { depth: null });
