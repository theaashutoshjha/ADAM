import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');
const nullSc = db.prepare('SELECT id, audit_id, call_id, resolved_trade_id FROM scorecards WHERE resolved_trade_id IS NULL OR resolved_trade_id = 0').all();
console.log('scorecards where resolved_trade_id is null/0:', nullSc);

const totalSc = (db.prepare('SELECT count(*) as c FROM scorecards').get() as any)?.c;
const totalAu = (db.prepare('SELECT count(*) as c FROM audits').get() as any)?.c;
console.log(`Scorecards: ${totalSc}, Audits: ${totalAu}`);

if (nullSc.length > 0) {
  for (const row of nullSc as any[]) {
    db.prepare('DELETE FROM scorecards WHERE id = ?').run(row.id);
    if (row.audit_id) {
      db.prepare('DELETE FROM audits WHERE id = ?').run(row.audit_id);
    }
  }
  console.log('Cleaned null trade_id scorecards. New scorecards:', db.prepare('SELECT count(*) as c FROM scorecards').get());
  console.log('New audits:', db.prepare('SELECT count(*) as c FROM audits').get());
}
