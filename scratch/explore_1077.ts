import { DatabaseSync } from 'node:sqlite';
import { extractCleanPhoneKeys, parseTradeSecondsFromMidnight, normalizeDateToStandard } from '../server/pipeline/tradePreOrderClusterer';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';

const db = new DatabaseSync('.data/auditeq_production.db');
const calls = db.prepare('SELECT * FROM calls WHERE id <= 4096 ORDER BY id ASC').all() as any[];
const trades = db.prepare('SELECT * FROM trades ORDER BY trade_date, trade_time').all() as any[];

// Test different matching windows / criteria to see what yields ~1073 or ~1077:

// 1. Calls on same date or within 1 day before trade
// 2. Calls with duration >= 6s
// 3. Calls matching client code from directory
// Let's test various combinations!

const clientDir = db.prepare("SELECT * FROM clients").all() as any[];
console.log('Clients count in DB:', clientDir.length);

const tradeClients = new Set(trades.map(t => formatCleanClientCode(t.client || t.client_code)));
console.log('Unique trade clients:', tradeClients.size);

// Check all calls matching trade clients either by phone or UCC
const matchedCallsByClient = calls.filter(c => {
  const cc = formatCleanClientCode(c.client_code || c.client);
  if (cc && tradeClients.has(cc)) return true;
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.phone_number);
  for (const t of trades) {
    const tKeys = extractCleanPhoneKeys(t.phone_number || t.client_number || t.customer_number);
    for (const pk of pKeys) {
      if (tKeys.includes(pk)) return true;
    }
  }
  return false;
});
console.log('Total calls matching a trade client by UCC or phone:', matchedCallsByClient.length);

// Of these, how many have duration >= 6 seconds (not short hangup scrap)?
const genuineMatchedCalls = matchedCallsByClient.filter(c => (c.duration_seconds || 0) >= 6);
console.log('Of those, duration >= 6 seconds:', genuineMatchedCalls.length);

// How many calls occur on trade dates (01-10 to 16-10) during market/pre-order window (09:15 - 15:40)?
const marketHoursCalls = matchedCallsByClient.filter(c => {
  const sec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
  return sec >= 9 * 3600 + 15 * 60 && sec <= 15 * 3600 + 40 * 60;
});
console.log('Of those, during market hours (09:15 - 15:40):', marketHoursCalls.length);

// What if trade date is within 0-2 days?
let callsWithin2DaysBeforeTrade = 0;
const callSet2Days = new Set<number>();
for (const c of matchedCallsByClient) {
  const cDate = normalizeDateToStandard(c.call_date);
  const cSec = parseTradeSecondsFromMidnight(c.call_time, c.call_date);
  const pKeys = extractCleanPhoneKeys(c.customer_number || c.calling_number || c.phone_number);
  const cc = formatCleanClientCode(c.client_code || c.client);

  // Check if client had a trade on same date or up to 2 days later
  const hasTradeNearby = trades.some(t => {
    const tClient = formatCleanClientCode(t.client || t.client_code);
    const tKeys = extractCleanPhoneKeys(t.phone_number || t.client_number);
    const isSameClient = (cc && cc === tClient) || pKeys.some(pk => tKeys.includes(pk));
    if (!isSameClient) return false;

    const tDate = normalizeDateToStandard(t.trade_date);
    if (tDate === cDate) {
      const tSec = parseTradeSecondsFromMidnight(t.trade_time, t.trade_date);
      return tSec >= cSec - 300; // call before trade
    }
    return tDate > cDate; // trade on future date
  });

  if (hasTradeNearby) {
    callsWithin2DaysBeforeTrade++;
    callSet2Days.add(c.id);
  }
}
console.log('Calls made before trade (same date or preceding date):', callsWithin2DaysBeforeTrade);
