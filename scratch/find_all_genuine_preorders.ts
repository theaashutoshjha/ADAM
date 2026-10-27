import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const allCalls = db.prepare('SELECT id, duration_seconds, transcript, classification, call_type, customer_number, calling_number, client_code FROM calls').all() as any[];
const allTrades = db.prepare('SELECT id, client, client_number, phone_number, symbol, quantity, price, price_display FROM trades').all() as any[];

console.log(`Analyzing all ${allCalls.length} calls and ${allTrades.length} trades...`);

// Let's find every call that has:
// 1. Duration >= 8s
// 2. Transcript words >= 15
// 3. No voicemail phrases
// 4. Real trading intent or scrip mention or order action

const voicemailRegex = /\b(?:voice\s*mail|voicemail|forwarded|leave\s*a\s*message|record\s*your\s*message|record\s*your\s*name|person\s*is\s*available|trying\s*to\s*reach|at\s*the\s*tone|assistant\s*recording\s*this\s*call|google\s*assistant|switched\s*off|not\s*reachable|busy\s*right\s*now)\b/i;

const tradeKeywords = [
  'buy', 'sell', 'order', 'trade', 'shares', 'lot', 'lots', 'cmp', 'market price',
  'limit', 'quantity', 'price', 'bhav', 'kharid', 'bech', 'kar do', 'theek hai',
  'confirm', 'le lo', 'daal do', 'put', 'call', 'ce', 'pe', 'strike', 'target',
  'stoploss', 'square off', 'delivery', 'intraday', 'nifty', 'sensex', 'banknifty',
  'ऑर्डर', 'खरीद', 'बेच', 'शेयर'
];

const genuinePreOrderCalls: any[] = [];

for (const c of allCalls) {
  const tx = (c.transcript || '').trim().toLowerCase();
  const dur = c.duration_seconds || 0;
  const words = tx.split(/\s+/).filter((w: string) => w.length > 0);

  if (dur < 8 || words.length < 15 || voicemailRegex.test(tx) || tx.includes('silence') || tx.includes('no speech')) {
    continue;
  }

  // Count trading keyword occurrences
  let kwCount = 0;
  for (const kw of tradeKeywords) {
    if (tx.includes(kw)) kwCount++;
  }

  // Check if phone or UCC links to any trade
  const p = (c.customer_number || c.calling_number || '').replace(/\D/g, '').slice(-10);
  const code = (c.client_code || '').toUpperCase();

  const linkedTrades = allTrades.filter(t => {
    const tp = (t.phone_number || t.client_number || '').replace(/\D/g, '').slice(-10);
    const tc = (t.client || '').toUpperCase();
    return (p && tp === p) || (code && tc === code);
  });

  if (kwCount >= 1 || linkedTrades.length > 0) {
    genuinePreOrderCalls.push({
      call: c,
      dur,
      words: words.length,
      kwCount,
      linkedTradesCount: linkedTrades.length,
      currentClass: c.classification
    });
  }
}

console.log(`Total Genuine Pre-Order Candidates with Trade Links or Dialogue: ${genuinePreOrderCalls.length}`);

// Breakdown by current classification
const byClass: Record<string, number> = {};
for (const g of genuinePreOrderCalls) {
  byClass[g.currentClass] = (byClass[g.currentClass] || 0) + 1;
}
console.log('By current classification:', byClass);
