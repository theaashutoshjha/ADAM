import { DatabaseSync } from 'node:sqlite';
import { extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard } from '../server/pipeline/tradePreOrderClusterer';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';

const db = new DatabaseSync('.data/auditeq_production.db');

// Load original calls (id <= 4096)
const calls = db.prepare('SELECT * FROM calls WHERE id <= 4096 ORDER BY id ASC').all() as any[];
const trades = db.prepare('SELECT * FROM trades ORDER BY trade_date, trade_time').all() as any[];

console.log(`Analyzing ${calls.length} original calls against ${trades.length} trades.`);

// Index trades by client phone and trade_date
const tradesByPhoneDate = new Map<string, any[]>();
const tradesByClientDate = new Map<string, any[]>();

for (const t of trades) {
  const tDate = normalizeDateToStandard(t.trade_date);
  const pKeys = extractCleanPhoneKeys(t.phone_number || t.client_number || t.customer_number);
  for (const k of pKeys) {
    const key = `${k}__${tDate}`;
    if (!tradesByPhoneDate.has(key)) tradesByPhoneDate.set(key, []);
    tradesByPhoneDate.get(key)!.push(t);
  }
  const clientCode = formatCleanClientCode(t.client || t.client_code);
  if (clientCode) {
    const key = `${clientCode}__${tDate}`;
    if (!tradesByClientDate.has(key)) tradesByClientDate.set(key, []);
    tradesByClientDate.get(key)!.push(t);
  }
}

// For each call, check if there is an executed trade for this customer AFTER the call on the same date!
let callsBeforeTrade = 0;
let callsAfterAllTrades = 0;
let callsNoTradesOnDate = 0;
let callsNoTradesEver = 0;

const preOrderCalls: any[] = [];
const nonPreOrderCalls: any[] = [];

for (const c of calls) {
  const cDate = normalizeDateToStandard(c.call_date);
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.phone_number);
  const cClient = formatCleanClientCode(c.client_code || c.client);
  const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);

  // Find all trades for this customer on the same date
  const candidateTrades: any[] = [];
  const seenTrades = new Set<number>();

  for (const k of pKeys) {
    for (const t of (tradesByPhoneDate.get(`${k}__${cDate}`) || [])) {
      if (!seenTrades.has(t.id)) { seenTrades.add(t.id); candidateTrades.push(t); }
    }
  }
  if (cClient) {
    for (const t of (tradesByClientDate.get(`${cClient}__${cDate}`) || [])) {
      if (!seenTrades.has(t.id)) { seenTrades.add(t.id); candidateTrades.push(t); }
    }
  }

  if (candidateTrades.length === 0) {
    callsNoTradesOnDate++;
    nonPreOrderCalls.push(c);
    continue;
  }

  // Check if there is ANY trade executed at or AFTER the call time (with e.g. 60s tolerance for clock drift)
  const tradesAfterCall = candidateTrades.filter(t => {
    const tSec = parseTradeSecondsFromMidnight(t.trade_time, t.trade_date);
    return tSec >= cSec - 60; // Trade happened after the call (or within 60s)
  });

  if (tradesAfterCall.length > 0) {
    callsBeforeTrade++;
    preOrderCalls.push({ call: c, tradesAfterCall });
  } else {
    callsAfterAllTrades++;
    nonPreOrderCalls.push(c);
  }
}

console.log('=== RESULTS FOR REAL CALLS (ID <= 4096) ===');
console.log('Calls made BEFORE trade execution time on the same date:', callsBeforeTrade);
console.log('Calls made AFTER all trades were already executed on that date:', callsAfterAllTrades);
console.log('Calls with NO trades on that date for this customer:', callsNoTradesOnDate);
