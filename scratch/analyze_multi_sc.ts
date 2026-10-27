import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const prodDb = path.join(process.cwd(), '.data', 'auditeq_production.db');
const db = new DatabaseSync(prodDb);

const multiSc = db.prepare(`
  SELECT call_id, COUNT(*) as c, GROUP_CONCAT(id) as sc_ids, GROUP_CONCAT(resolved_trade_id) as trade_ids
  FROM scorecards
  WHERE call_id > 0
  GROUP BY call_id
  HAVING c > 1
`).all() as any[];

console.log('Total calls with multiple scorecards:', multiSc.length);
let totalExcessScorecards = 0;
for (const m of multiSc) {
  totalExcessScorecards += (m.c - 1);
}
console.log('Total excess duplicate scorecards:', totalExcessScorecards);

const totalScorecards = (db.prepare("SELECT COUNT(*) as c FROM scorecards").get() as any).c;
console.log('Total scorecards now:', totalScorecards);
console.log('Expected scorecards after consolidating by call_id:', totalScorecards - totalExcessScorecards);

const sample = multiSc.slice(0, 5);
for (const s of sample) {
  console.log(`\nCall ID ${s.call_id} has ${s.c} scorecards: ${s.sc_ids}`);
  const trades = db.prepare(`SELECT id, symbol, quantity, price, side, advisor_name, client FROM trades WHERE matched_call_id = ? OR id IN (${s.trade_ids})`).all(s.call_id);
  console.log('  Trades for this call:', trades);
}
