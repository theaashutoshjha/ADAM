import { DatabaseSync } from 'node:sqlite';
import { getPreOrdersAnalysisFromDb } from '../server/pipeline/tradePreOrderClusterer';

const db = new DatabaseSync('.data/auditeq_production.db');
const analysis = getPreOrdersAnalysisFromDb(db as any);
const cl = analysis.clusters.find((c: any) => c.cluster_id === 'POC-2026-10-01-WID56889-NIFTY27OCT2622200PE-27');
console.log('Cluster:', cl);

const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(cl?.matched_call_id);
console.log('Matched Call:', call);
