import { DatabaseSync } from 'node:sqlite';
import { getPreOrdersAnalysisFromDb } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');
const analysis = getPreOrdersAnalysisFromDb(db);
const targetClusters = analysis.clusters.filter((c: any) => c.match_status !== 'CONFIRMED_VIA_MAIL');

console.log('Total target pre-order clusters:', targetClusters.length);

const callIds = new Set<number>();
let unlinkedCount = 0;
for (const c of targetClusters) {
  if (c.matched_call_id && c.matched_call_id > 0) {
    callIds.add(c.matched_call_id);
  } else {
    unlinkedCount++;
  }
}

console.log('Distinct matched calls:', callIds.size);
console.log('Unlinked clusters:', unlinkedCount);

// Check transcript status of all these calls
const callIdsArray = Array.from(callIds);
const calls = db.prepare(`
  SELECT id, transcript_model, length(transcript) as len, classification, call_type
  FROM calls
  WHERE id IN (${callIdsArray.join(',')})
`).all() as any[];

const byModel: Record<string, number> = {};
let emptyTranscripts = 0;
for (const c of calls) {
  const m = c.transcript_model || 'none';
  byModel[m] = (byModel[m] || 0) + 1;
  if (!c.len || c.len < 10) emptyTranscripts++;
}

console.log('Calls by model:', byModel);
console.log('Empty transcripts:', emptyTranscripts);
