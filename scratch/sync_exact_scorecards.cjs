const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Check count of scorecards vs calls
const totalPreOrderCalls = db.prepare(`
  SELECT count(*) as count FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).get().count;

const totalScorecards = db.prepare('SELECT count(*) as count FROM scorecards').get().count;

const orphanScorecards = db.prepare(`
  SELECT count(*) as count FROM scorecards WHERE call_id NOT IN (SELECT id FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order')
`).get().count;

console.log('Total pre-order calls:', totalPreOrderCalls);
console.log('Total scorecards:', totalScorecards);
console.log('Scorecards not matching pre-order calls:', orphanScorecards);

// Remove stale/orphan scorecards so that scorecards match calls exactly 1-to-1
if (orphanScorecards > 0) {
  db.prepare(`
    DELETE FROM scorecards 
    WHERE call_id NOT IN (SELECT id FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order')
  `).run();
  console.log('Cleaned up orphan scorecards. Total scorecards now:', db.prepare('SELECT count(*) as count FROM scorecards').get().count);
}
