const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const ids = [619, 718, 766, 893, 932, 949, 1058, 1127, 1159, 1165];
for (const id of ids) {
  const row = db.prepare('SELECT s.call_id, s.client_code, s.q2_evidence, c.transcript FROM scorecards s JOIN calls c ON s.call_id = c.id WHERE s.call_id = ?').get(id);
  console.log(`[Call #${row.call_id}] UCC: ${row.client_code}`);
  console.log(`Evidence: ${row.q2_evidence}`);
  console.log(`Transcript: "${row.transcript}"\n`);
}
