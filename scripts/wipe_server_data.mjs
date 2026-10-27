import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const dbPath = path.join(cwd, '.data', 'auditeq_production.db');

if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = OFF;');
  const tables = [
    'calls', 'trades', 'matches', 'audits', 'scorecards', 'jobs', 'logs',
    'call_segments', 'call_words', 'call_orders', 'order_executions',
    'mail_history', 'report_archives', 'cleared_backups', 'import_batches',
    'import_files', 'outbox_events', 'integration_events', 'email_outbox',
    'calls_archived_metadata_only', 'scorecards_archived_metadata_only', 'audits_archived_metadata_only'
  ];
  for (const t of tables) {
    try {
      db.exec(`DELETE FROM ${t};`);
      console.log(`Cleared table: ${t}`);
    } catch (e) {
      // Table might not exist, ignore
    }
  }
  try {
    const quoted = tables.map(t => `'${t}'`).join(',');
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN (${quoted});`);
  } catch (e) {}
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.exec('VACUUM;');
  console.log('Database auditeq_production.db successfully wiped.');
}

// Clean backup files in .data
const dataDir = path.join(cwd, '.data');
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir);
  for (const f of files) {
    if (f.includes('backup') || f.includes('.bak') || (f.endsWith('.db') && f !== 'auditeq_production.db' && f !== 'auditeq.db')) {
      try {
        fs.unlinkSync(path.join(dataDir, f));
        console.log('Deleted backup file:', f);
      } catch (err) {}
    }
  }
}

// Delete root old exports
const rootReports = ['Audit_Report_Accurate.csv', 'Audit_Report_Detailed.csv', 'temp_check.js'];
for (const r of rootReports) {
  const p = path.join(cwd, r);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
      console.log('Deleted root report:', r);
    } catch (e) {}
  }
}

console.log('ALL SERVER OPERATIONAL DATA DELETED SUCCESSFULLY.');
