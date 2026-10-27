const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare("SELECT id, storage_path, transcript FROM calls WHERE storage_path IS NOT NULL AND storage_path != ''").all();
let existsCount = 0;
let hasTranscriptCount = 0;
for (const r of rows) {
  if (fs.existsSync(r.storage_path)) existsCount++;
  if (r.transcript && r.transcript.trim().length >= 15) hasTranscriptCount++;
}

console.log({ totalRowsWithPath: rows.length, existsOnDisk: existsCount, hasTranscript: hasTranscriptCount });
