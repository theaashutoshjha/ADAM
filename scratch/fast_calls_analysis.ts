import { DatabaseSync } from 'node:sqlite';
import { extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard } from '../server/pipeline/tradePreOrderClusterer';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';

const db = new DatabaseSync('.data/auditeq_production.db');
const calls = db.prepare('SELECT * FROM calls WHERE id <= 4096 ORDER BY id ASC').all() as any[];
const trades = db.prepare('SELECT * FROM trades ORDER BY trade_date, trade_time').all() as any[];

// Map of all trade phone keys and clients
const tradePhoneSet = new Set<string>();
const tradeClientSet = new Set<string>();
const tradeDateSet = new Set<string>();

// Map of (phone, date) -> min trade time
const minTradeTimeByPhoneDate = new Map<string, number>();
const minTradeTimeByClientDate = new Map<string, number>();

// Map of (phone, date) -> max trade time
const maxTradeTimeByPhoneDate = new Map<string, number>();
const maxTradeTimeByClientDate = new Map<string, number>();

for (const t of trades) {
  const d = normalizeDateToStandard(t.trade_date);
  tradeDateSet.add(d);
  const tSec = parseTradeSecondsFromMidnight(t.trade_time, t.trade_date);
  const pKeys = extractCleanPhoneKeys(t.phone_number || t.client_number || t.customer_number);
  for (const p of pKeys) {
    tradePhoneSet.add(p);
    const pd = `${p}__${d}`;
    minTradeTimeByPhoneDate.set(pd, Math.min(minTradeTimeByPhoneDate.get(pd) ?? 86400, tSec));
    maxTradeTimeByPhoneDate.set(pd, Math.max(maxTradeTimeByPhoneDate.get(pd) ?? 0, tSec));
  }
  const cc = formatCleanClientCode(t.client || t.client_code);
  if (cc) {
    tradeClientSet.add(cc);
    const cd = `${cc}__${d}`;
    minTradeTimeByClientDate.set(cd, Math.min(minTradeTimeByClientDate.get(cd) ?? 86400, tSec));
    maxTradeTimeByClientDate.set(cd, Math.max(maxTradeTimeByClientDate.get(cd) ?? 0, tSec));
  }
}

// 1. Calls that occurred before AT LEAST ONE trade on the same date for that client
let callsBeforeSomeTrade = 0;
// 2. Calls that occurred on the same date for that client (any time)
let callsSameDateAnyTime = 0;
// 3. Calls for trading clients on ANY date
let callsAnyDate = 0;

const preOrderCandidateCallIds = new Set<number>();

for (const c of calls) {
  const cDate = normalizeDateToStandard(c.call_date);
  const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.phone_number);
  const cc = formatCleanClientCode(c.client_code || c.client);

  let isClient = false;
  let hasSameDate = false;
  let isBeforeTrade = false;

  for (const p of pKeys) {
    if (tradePhoneSet.has(p)) isClient = true;
    const pd = `${p}__${cDate}`;
    if (maxTradeTimeByPhoneDate.has(pd)) {
      hasSameDate = true;
      if (cSec <= maxTradeTimeByPhoneDate.get(pd)! + 60) {
        isBeforeTrade = true;
      }
    }
  }

  if (cc) {
    if (tradeClientSet.has(cc)) isClient = true;
    const cd = `${cc}__${cDate}`;
    if (maxTradeTimeByClientDate.has(cd)) {
      hasSameDate = true;
      if (cSec <= maxTradeTimeByClientDate.get(cd)! + 60) {
        isBeforeTrade = true;
      }
    }
  }

  if (isClient) callsAnyDate++;
  if (hasSameDate) callsSameDateAnyTime++;
  if (isBeforeTrade) {
    callsBeforeSomeTrade++;
    preOrderCandidateCallIds.add(c.id);
  }
}

console.log('--- CALL ANALYSIS ---');
console.log('Calls for trading clients across all dates:', callsAnyDate);
console.log('Calls for trading clients on their trade date:', callsSameDateAnyTime);
console.log('Calls for trading clients made BEFORE trade execution time on trade date:', callsBeforeSomeTrade);
