import { DatabaseSync } from 'node:sqlite';
import { getPreOrdersAnalysisFromDb } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');
const analysis = getPreOrdersAnalysisFromDb(db);
const targetClusters = analysis.clusters.filter((c: any) => c.match_status !== 'CONFIRMED_VIA_MAIL');

console.log('Target pre-order clusters count:', targetClusters.length);

const callUsage: Record<number, number> = {};
for (const c of targetClusters) {
  if (c.matched_call_id) {
    callUsage[c.matched_call_id] = (callUsage[c.matched_call_id] || 0) + 1;
  }
}

const callCounts = Object.values(callUsage);
const singleCall = callCounts.filter(cnt => cnt === 1).length;
const multiCall = callCounts.filter(cnt => cnt > 1).length;
console.log(`Calls linked to exactly 1 cluster: ${singleCall}`);
console.log(`Calls linked to multiple clusters: ${multiCall}`);
console.log(`Max clusters per call: ${Math.max(...callCounts)}`);

// Check scorecards in database
const scorecards = db.prepare(`
  SELECT count(*) as c, 
         avg(score) as avg_score,
         sum(case when score = 5 then 1 else 0 end) as score_5,
         sum(case when score = 4 then 1 else 0 end) as score_4,
         sum(case when is_fatal = 1 then 1 else 0 end) as fatal,
         sum(case when q1_status = 'PASS' then 1 else 0 end) as q1_pass,
         sum(case when q2_status = 'PASS' then 1 else 0 end) as q2_pass,
         sum(case when q3_status = 'PASS' then 1 else 0 end) as q3_pass,
         sum(case when q4_status = 'PASS' then 1 else 0 end) as q4_pass,
         sum(case when q5_status = 'PASS' then 1 else 0 end) as q5_pass
  FROM scorecards
`).get() as any;

console.log('Scorecards statistics in DB:', scorecards);

// Check audits in database
const audits = db.prepare(`
  SELECT count(*) as c,
         sum(case when compliance_disposition = 'COMPLIANT' then 1 else 0 end) as compliant,
         sum(case when compliance_disposition = 'NON_COMPLIANT' then 1 else 0 end) as non_compliant
  FROM audits
`).get() as any;

console.log('Audits statistics in DB:', audits);
