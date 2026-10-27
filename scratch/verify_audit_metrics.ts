import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

const callCols = (db.prepare('PRAGMA table_info(calls)').all() as any[]).map(c => c.name);

const totalCalls = (db.prepare('SELECT count(*) as count FROM calls').get() as any).count;
const preOrderCalls = (db.prepare("SELECT count(*) as count FROM calls WHERE classification = 'PRE_ORDER'").get() as any).count;
const preOrderModels = db.prepare("SELECT transcript_model, count(*) as count FROM calls WHERE classification = 'PRE_ORDER' GROUP BY transcript_model").all();
const allCallModels = db.prepare("SELECT transcript_model, count(*) as count FROM calls GROUP BY transcript_model").all();
const totalScorecards = (db.prepare('SELECT count(*) as count FROM scorecards').get() as any).count;
const totalAudits = (db.prepare('SELECT count(*) as count FROM audits').get() as any).count;
const linkedTrades = (db.prepare('SELECT count(*) as count FROM scorecards WHERE resolved_trade_id IS NOT NULL AND resolved_trade_id > 0').get() as any).count;
const linkedCalls = (db.prepare('SELECT count(*) as count FROM scorecards WHERE call_id IS NOT NULL AND call_id > 0').get() as any).count;

const qStats = db.prepare(`
  SELECT 
    sum(case when q1_status = 'PASS' then 1 else 0 end) as q1_pass,
    sum(case when q1_status = 'FAIL' then 1 else 0 end) as q1_fail,
    sum(case when q2_status = 'PASS' then 1 else 0 end) as q2_pass,
    sum(case when q2_status = 'FAIL' then 1 else 0 end) as q2_fail,
    sum(case when q3_status = 'PASS' then 1 else 0 end) as q3_pass,
    sum(case when q3_status = 'FAIL' then 1 else 0 end) as q3_fail,
    sum(case when q4_status = 'PASS' then 1 else 0 end) as q4_pass,
    sum(case when q4_status = 'FAIL' then 1 else 0 end) as q4_fail,
    sum(case when q5_status = 'PASS' then 1 else 0 end) as q5_pass,
    sum(case when q5_status = 'FAIL' then 1 else 0 end) as q5_fail,
    avg(score) as avg_score,
    sum(case when score = 5 then 1 else 0 end) as perfect_score_5,
    sum(case when score = 4 then 1 else 0 end) as score_4,
    sum(case when score = 3 then 1 else 0 end) as score_3,
    sum(case when score < 3 then 1 else 0 end) as score_under_3
  FROM scorecards
`).get();

const auditStats = db.prepare(`
  SELECT 
    compliance_disposition,
    count(*) as count
  FROM audits
  GROUP BY compliance_disposition
`).all();

const smCalls = (db.prepare("SELECT count(id) as count FROM calls WHERE transcript_model LIKE '%speechmatics%'").get() as any).count;
const scCols = (db.prepare('PRAGMA table_info(scorecards)').all() as any[]).map(c => c.name);
const smAudits = (db.prepare("SELECT count(id) as count FROM audits WHERE model LIKE '%speechmatics%'").get() as any).count;
const auditModels = db.prepare("SELECT model, count(id) as count FROM audits GROUP BY model").all();

console.log(JSON.stringify({
  totalCalls,
  preOrderCalls,
  preOrderModels,
  totalScorecards,
  totalAudits,
  linkedTrades,
  linkedCalls,
  qStats,
  auditStats,
  auditModels,
  speechmaticsRemnants: {
    calls: smCalls,
    audits: smAudits
  }
}, null, 2));
