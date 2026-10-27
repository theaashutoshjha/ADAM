const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT id, storage_path, duration_seconds, transcript, transcript_raw, transcript_status
  FROM calls
  WHERE id IN (2, 23, 31, 266, 330, 1303, 3036)
`).all();

for (const r of rows) {
  console.log(`Call #${r.id}: transcript=${JSON.stringify(r.transcript)}, raw=${JSON.stringify(r.transcript_raw)}, status=${r.transcript_status}`);
}
