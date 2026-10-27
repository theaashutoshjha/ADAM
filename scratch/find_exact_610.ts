import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

// Check all tables and distinct counts
const tables = ['calls', 'trades', 'matches', 'audits', 'scorecards', 'pre_order_exceptions', 'jobs'];
for (const t of tables) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all() as any[];
    for (const c of cols) {
      const distinct = db.prepare(`SELECT count(DISTINCT ${c.name}) as cnt FROM ${t}`).get() as any;
      if (distinct.cnt >= 600 && distinct.cnt <= 620) {
        console.log(`Table ${t}.${c.name} distinct count:`, distinct.cnt);
      }
      const vals = db.prepare(`SELECT ${c.name}, count(*) as cnt FROM ${t} GROUP BY ${c.name} HAVING count(*) >= 600 AND count(*) <= 620`).all() as any[];
      if (vals.length > 0) {
        console.log(`Table ${t}.${c.name} group having 600-620:`, vals);
      }
    }
  } catch (e: any) {
    // console.log(t, e.message);
  }
}
