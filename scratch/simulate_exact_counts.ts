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

// Pre-index calls
const callsByPhone = new Map<string, any[]>();
const callsByAdvisorDate = new Map<string, any[]>();

for (const c of calls) {
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.registered_number);
  for (const pk of pKeys) {
    if (!callsByPhone.has(pk)) callsByPhone.set(pk, []);
    callsByPhone.get(pk)!.push(c);
  }

  const cDate = normalizeDateToStandard(c.call_date);
  const adv = (c.advisor_name || c.caller_name || '').toLowerCase().trim();
  if (adv) {
    const k = `${adv}__${cDate}`;
    if (!callsByAdvisorDate.has(k)) callsByAdvisorDate.set(k, []);
    callsByAdvisorDate.get(k)!.push(c);
  }
  const dealer = (c.dealer || '').toUpperCase().trim();
  if (dealer) {
    const k = `${dealer}__${cDate}`;
    if (!callsByAdvisorDate.has(k)) callsByAdvisorDate.set(k, []);
    callsByAdvisorDate.get(k)!.push(c);
  }
}

let matchedCount = 0;
let mailCount = 0;

for (const cluster of summary.clusters) {
  const cDate = normalizeDateToStandard(cluster.trade_date);
  const cTime = cluster.start_seconds;

  const pKeys = new Set<string>();
  for (const k of extractCleanPhoneKeys(cluster.phone_number)) pKeys.add(k);
  for (const t of cluster.trades) {
    for (const k of extractCleanPhoneKeys(t.phone_number || t.client_number)) pKeys.add(k);
  }

  const earliestTrade = cluster.trades[0];
  const advName = (earliestTrade?.advisor_name || '').toLowerCase().trim();
  const dealerId = (earliestTrade?.dealer || '').toUpperCase().trim();
  const clientUcc = (cluster.client_code || '').toUpperCase().trim();
  const uccDigits = clientUcc.replace(/^[A-Z]+/i, '');
  const stockSymbol = cluster.symbol.toLowerCase();

  let bestCall: any = null;

  // 1. Check Phone Match
  const phoneCalls: any[] = [];
  for (const pk of pKeys) {
    if (callsByPhone.has(pk)) phoneCalls.push(...callsByPhone.get(pk)!);
  }
  const sameDayPhoneCalls = phoneCalls.filter(c => normalizeDateToStandard(c.call_date) === cDate);
  const priorPhoneCalls = sameDayPhoneCalls.filter(c => parseTradeSecondsFromMidnight(c.call_time, c.call_date) <= cTime + 60);

  if (priorPhoneCalls.length > 0) {
    priorPhoneCalls.sort((a, b) => {
      const aSec = parseTradeSecondsFromMidnight(a.call_time, a.call_date);
      const bSec = parseTradeSecondsFromMidnight(b.call_time, b.call_date);
      return (cTime - aSec) - (cTime - bSec);
    });
    bestCall = priorPhoneCalls[0];
  } else if (sameDayPhoneCalls.length > 0) {
    // Within day
    sameDayPhoneCalls.sort((a, b) => {
      const aSec = parseTradeSecondsFromMidnight(a.call_time, a.call_date);
      const bSec = parseTradeSecondsFromMidnight(b.call_time, b.call_date);
      return Math.abs(cTime - aSec) - Math.abs(cTime - bSec);
    });
    bestCall = sameDayPhoneCalls[0];
  }

  // 2. Advisor / Dealer + Date + Proximity / Dialogue
  if (!bestCall) {
    const advCalls: any[] = [];
    if (dealerId && callsByAdvisorDate.has(`${dealerId}__${cDate}`)) {
      advCalls.push(...callsByAdvisorDate.get(`${dealerId}__${cDate}`)!);
    }
    if (advName && callsByAdvisorDate.has(`${advName}__${cDate}`)) {
      advCalls.push(...callsByAdvisorDate.get(`${advName}__${cDate}`)!);
    }
    if (advCalls.length === 0 && advName) {
      const firstWord = advName.split(/\s+/)[0];
      if (firstWord.length >= 4) {
        for (const [k, v] of callsByAdvisorDate.entries()) {
          if (k.endsWith(`__${cDate}`) && k.includes(firstWord)) {
            advCalls.push(...v);
          }
        }
      }
    }

    const uniqueAdvCalls = Array.from(new Map(advCalls.map(c => [c.id, c])).values());
    if (uniqueAdvCalls.length > 0) {
      const scored = uniqueAdvCalls.map(c => {
        const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
        const gap = cTime - cSec;
        const tx = (c.transcript || '').toLowerCase();

        let s = 0;
        if (gap >= -180 && gap <= 3600) s += 300;
        if (gap >= 0 && gap <= 900) s += 400;
        if (uccDigits.length >= 4 && tx.includes(uccDigits)) s += 1000;
        if (tx.includes(clientUcc.toLowerCase())) s += 1500;
        if (stockSymbol.length > 3 && tx.includes(stockSymbol)) s += 500;
        s -= Math.min(200, Math.abs(gap) / 10);
        return { call: c, s, gap };
      }).sort((a, b) => b.s - a.s);

      if (scored.length > 0 && scored[0].s > 0) {
        bestCall = scored[0].call;
      }
    }
  }

  if (bestCall) {
    matchedCount++;
  } else {
    mailCount++;
  }
}

console.log({
  totalOrders: summary.clusters.length,
  matchedPreOrderCalls: matchedCount,
  mailConfirmations: mailCount
});
