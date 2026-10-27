import { DatabaseSync } from 'node:sqlite';
import { getPreOrdersAnalysisFromDb } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');
const analysis = getPreOrdersAnalysisFromDb(db);

console.log('=== CLUSTERER ANALYSIS ===');
console.log('Total Orders:', analysis.total_orders);
console.log('Target Pre-Orders:', analysis.total_pre_orders);
console.log('Mail Confirmations:', analysis.mail_confirmations_count);
console.log('Total Matched Calls:', analysis.total_matched_calls);
console.log('Missing Calls:', analysis.missing_calls_count);
console.log('Clusters count:', analysis.clusters?.length);

const targetClusters = analysis.clusters.filter(c => c.match_status !== 'CONFIRMED_VIA_MAIL');
console.log('Target Pre-Order Clusters (not mail):', targetClusters.length);

const matchedWithCall = targetClusters.filter(c => c.matched_call_id && c.matched_call_id > 0);
console.log('Target Clusters with matched_call_id:', matchedWithCall.length);

const uniqueCallsInClusters = new Set(matchedWithCall.map(c => c.matched_call_id));
console.log('Unique matched calls in clusters:', uniqueCallsInClusters.size);

// Sample clusters
console.log('\nSample First 5 Target Clusters:');
for (const c of targetClusters.slice(0, 5)) {
  console.log(`Cluster ${c.cluster_id} [UCC: ${c.client_code}, Symbol: ${c.symbol}, Date: ${c.trade_date}, Time: ${c.start_time}-${c.end_time}, Trades: ${c.trade_count}, Matched Call: #${c.matched_call_id}]`);
}
