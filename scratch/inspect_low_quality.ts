import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const preOrders = db.prepare(`
  SELECT id, duration_seconds, transcript, matched_trade_id
  FROM calls
  WHERE classification = 'PRE_ORDER'
`).all() as any[];

const tradeKeywords = [
  'buy', 'sell', 'order', 'trade', 'shares', 'lot', 'lots', 'cmp', 'market price',
  'limit', 'quantity', 'price', 'bhav', 'kharid', 'bech', 'kar do', 'theek hai',
  'confirm', 'le lo', 'daal do', 'put', 'call', 'ce', 'pe', 'strike', 'target',
  'stoploss', 'square off', 'delivery', 'intraday', 'nifty', 'sensex', 'banknifty',
  'ऑर्डर', 'खरीद', 'बेच', 'शेयर', 'कॉल', 'पुट'
];

const lowQuality: any[] = [];

for (const c of preOrders) {
  const tx = (c.transcript || '').toLowerCase();
  const words = tx.split(/\s+/).filter((w: string) => w.length > 0);
  const dur = c.duration_seconds || 0;

  let hasKw = false;
  for (const kw of tradeKeywords) {
    if (tx.includes(kw)) {
      hasKw = true;
      break;
    }
  }

  if (words.length < 20 || !hasKw) {
    lowQuality.push({
      id: c.id,
      dur,
      words: words.length,
      hasKw,
      tx: tx.slice(0, 120)
    });
  }
}

console.log(`Low quality / questionable pre-orders: ${lowQuality.length}`);
for (const l of lowQuality.slice(0, 20)) {
  console.log(`Call ${l.id} (dur: ${l.dur}s, words: ${l.words}, hasKw: ${l.hasKw}): ${l.tx}`);
}
