import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { resolveAuthoritativeOrderEvent } from '../server/pipeline/criticalEntityResolver';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const currentScorecards = db.prepare(`
  SELECT s.id, s.call_id, s.resolved_trade_id,
         c.transcript, c.duration_seconds,
         t.symbol, t.quantity, t.price, t.trade_time, c.call_time
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  LEFT JOIN trades t ON s.resolved_trade_id = t.id
  WHERE s.is_current = 1
  LIMIT 15
`).all() as any[];

for (const sc of currentScorecards) {
  const sym = (sc.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
  const qty = sc.quantity || 0;
  const price = sc.price || 0;
  const orderRes = resolveAuthoritativeOrderEvent([], sc.transcript || '', sym, qty, price, false);

  console.log(`\n--- Call ${sc.call_id} (time: ${sc.call_time}, dur: ${sc.duration_seconds}s) vs Trade ${sc.resolved_trade_id} (time: ${sc.trade_time}) ---`);
  console.log(`Trade: Sym: ${sym}, Qty: ${qty}, Price: ${price}`);
  console.log(`OrderRes verified: ${orderRes.verified}`);
  console.log(`SymbolMatched: ${orderRes.symbolMatched}, QtyMatched: ${orderRes.quantityMatched}, PriceMatched: ${orderRes.priceMatched}`);
  console.log(`Evidence: ${orderRes.evidenceDetails.join(' | ')}`);
  console.log(`Transcript snippet: ${sc.transcript?.slice(0, 250)}...`);
}
