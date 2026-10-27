const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT id, storage_path, duration_seconds, transcript_status, pipeline_error
  FROM calls
  WHERE id IN (2, 23, 31, 266, 330, 1303, 1508, 2379, 2409, 2889, 3036, 3657)
`).all();

for (const r of rows) {
  const exists = fs.existsSync(r.storage_path);
  console.log(`Call #${r.id}: status=${r.transcript_status}, error=${r.pipeline_error}, fileExists=${exists}, path=${r.storage_path}`);
}
