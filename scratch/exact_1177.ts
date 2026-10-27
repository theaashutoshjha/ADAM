import { DatabaseSync } from 'node:sqlite';
import { getPreOrdersAnalysisFromDb } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');
const analysis = getPreOrdersAnalysisFromDb(db as any);
const targetClusters = analysis.clusters.filter((c: any) => c.match_status !== 'CONFIRMED_VIA_MAIL');
console.log('Target clusters count:', targetClusters.length);

const clusterTradeIds = new Set(targetClusters.map((c: any) => c.trade_ids[0]));
console.log('Unique primary trade IDs in clusters:', clusterTradeIds.size);

const scRows = db.prepare('SELECT id, resolved_trade_id, call_id FROM scorecards').all() as any[];
console.log('Total scorecards:', scRows.length);

const extraSc = scRows.filter(sc => !clusterTradeIds.has(sc.resolved_trade_id));
console.log('Scorecards not in target clusters:', extraSc);

if (extraSc.length > 0) {
  for (const extra of extraSc) {
    db.prepare('DELETE FROM scorecards WHERE id = ?').run(extra.id);
    db.prepare('DELETE FROM audits WHERE trade_id = ? OR id = ?').run(extra.resolved_trade_id, extra.id);
  }
  console.log('After removing extras: scorecards =', db.prepare('SELECT count(*) as c FROM scorecards').get());
  console.log('After removing extras: audits =', db.prepare('SELECT count(*) as c FROM audits').get());
}
