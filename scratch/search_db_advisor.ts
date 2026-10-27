import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const prodDb = path.join(process.cwd(), '.data', 'auditeq_production.db');
const db = new DatabaseSync(prodDb);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];

console.log('Searching all tables in DB for "advisor"...');
for (const table of tables) {
  const tableName = table.name;
  if (tableName.startsWith('sqlite_')) continue;
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    for (const col of cols) {
      if (col.type.toLowerCase().includes('text') || col.type.toLowerCase().includes('char')) {
        const matches = db.prepare(`SELECT ${col.name} as val, COUNT(*) as c FROM ${tableName} WHERE LOWER(${col.name}) LIKE '%advisor%' GROUP BY ${col.name} LIMIT 10`).all() as any[];
        if (matches.length > 0) {
          console.log(`[${tableName}.${col.name}] matches:`, matches);
        }
      }
    }
  } catch (e: any) {
    // console.error(e.message);
  }
}
