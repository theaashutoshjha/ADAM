import { DatabaseSync } from 'node:sqlite';
import { getPreOrdersAnalysisFromDb, extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');
const analysis = getPreOrdersAnalysisFromDb(db as any);
const targetClusters = analysis.clusters.filter((c: any) => c.match_status !== 'CONFIRMED_VIA_MAIL');

const allCalls = db.prepare('SELECT id, caller_id, call_date, call_time, duration_seconds, customer_number, calling_number, client_code, transcript FROM calls').all() as any[];

const callsByPhone = new Map<string, any[]>();
const callsByClient = new Map<string, any[]>();

for (const c of allCalls) {
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number);
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

let zeroPriorCount = 0;
const diffDateMatches = [];
const callLaterOnSameDate = [];
const noCallsAtAll = [];

for (const cluster of targetClusters) {
  const cDate = normalizeDateToStandard(cluster.trade_date);
  const pKeys = extractCleanPhoneKeys(cluster.phone_number);
  const cClient = (cluster.client_code || '').trim().toUpperCase();
  const tSec = cluster.start_seconds;

  const candidateCalls: any[] = [];
  const seen = new Set<number>();

  for (const k of pKeys) {
    for (const c of (callsByPhone.get(k) || [])) {
      if (!seen.has(c.id)) { seen.add(c.id); candidateCalls.push(c); }
    }
  }
  if (cClient) {
    for (const c of (callsByClient.get(cClient) || [])) {
      if (!seen.has(c.id)) { seen.add(c.id); candidateCalls.push(c); }
    }
  }

  const priorOnSameDate = candidateCalls.filter(c => {
    return normalizeDateToStandard(c.call_date) === cDate && parseTradeSecondsFromMidnight(c.call_time, c.call_date) <= tSec + 60;
  });

  if (priorOnSameDate.length === 0) {
    zeroPriorCount++;
    const sameDateCalls = candidateCalls.filter(c => normalizeDateToStandard(c.call_date) === cDate);
    if (sameDateCalls.length > 0) {
      callLaterOnSameDate.push({ cluster, calls: sameDateCalls });
    } else if (candidateCalls.length > 0) {
      diffDateMatches.push({ cluster, candidateCallsCount: candidateCalls.length });
    } else {
      noCallsAtAll.push(cluster);
    }
  }
}

console.log('Zero prior on same date:', zeroPriorCount);
console.log('Had calls on same date, but call was AFTER trade:', callLaterOnSameDate.length);
if (callLaterOnSameDate.length > 0) {
  console.log('Sample calls after trade:');
  for (const item of callLaterOnSameDate.slice(0, 5)) {
    const c = item.cluster;
    const call = item.calls[0];
    console.log(`Cluster ${c.cluster_id}: Trade at ${c.start_time}, Call at ${call.call_time} (diff ${parseTradeSecondsFromMidnight(call.call_time) - c.start_seconds}s)`);
  }
}
console.log('No calls on same date, but had calls on other dates:', diffDateMatches.length);
console.log('No calls at all for client/phone:', noCallsAtAll.length);
