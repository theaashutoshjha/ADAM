const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
const { getPreOrdersAnalysisFromDb } = require('./server/pipeline/tradePreOrderClusterer');

const res = getPreOrdersAnalysisFromDb(db);
console.log('PreOrdersSummary:', {
  totalOrders: res.totalOrders,
  targetPreOrders: res.targetPreOrders,
  mailConfirmations: res.mailConfirmations,
  matchedOrdersCount: res.matchedOrdersCount,
  unmatchedOrdersCount: res.unmatchedOrdersCount,
  matchRatePercent: res.matchRatePercent
});
