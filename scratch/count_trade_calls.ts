import { DatabaseSync } from 'node:sqlite';
import { extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard } from '../server/pipeline/tradePreOrderClusterer';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';

const db = new DatabaseSync('.data/auditeq_production.db');

// Real calls
const calls = db.prepare('SELECT * FROM calls WHERE id <= 4096 ORDER BY id ASC').all() as any[];
const trades = db.prepare('SELECT * FROM trades ORDER BY trade_date, trade_time').all() as any[];

const tradeClients = new Set<string>();
const tradePhones = new Set<string>();
const tradeDates = new Set<string>();
const clientTradeDates = new Set<string>();
const phoneTradeDates = new Set<string>();

for (const t of trades) {
  const d = normalizeDateToStandard(t.trade_date);
  tradeDates.add(d);
  const pKeys = extractCleanPhoneKeys(t.phone_number || t.client_number || t.customer_number);
  for (const p of pKeys) {
    tradePhones.add(p);
    phoneTradeDates.add(`${p}__${d}`);
  }
  const cc = formatCleanClientCode(t.client || t.client_code);
  if (cc) {
    tradeClients.add(cc);
    clientTradeDates.add(`${cc}__${d}`);
  }
}

// Check how many calls belong to trading clients on their trade date:
let callsOnTradeDate = 0;
let callsBeforeTradeExecution = 0;
let callsAnytimeTradeDate = 0;
let callsForTradingClientsAnyDate = 0;

for (const c of calls) {
  const d = normalizeDateToStandard(c.call_date);
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.phone_number);
  const cc = formatCleanClientCode(c.client_code || c.client);

  let isTradingClient = false;
  for (const p of pKeys) {
    if (tradePhones.has(p)) isTradingClient = true;
  }
  if (cc && tradeClients.has(cc)) isTradingClient = true;

  if (isTradingClient) {
    callsForTradingClientsAnyDate++;
  }

  let hasTradeOnSameDate = false;
  for (const p of pKeys) {
    if (phoneTradeDates.has(`${p}__${d}`)) hasTradeOnSameDate = true;
  }
  if (cc && clientTradeDates.has(`${cc}__${d}`)) hasTradeOnSameDate = true;

  if (hasTradeOnSameDate) {
    callsOnTradeDate++;
  }
}

console.log('Total genuine calls:', calls.length);
console.log('Calls for trading clients across any date:', callsForTradingClientsAnyDate);
console.log('Calls on the EXACT date when client had executed trades:', callsOnTradeDate);
