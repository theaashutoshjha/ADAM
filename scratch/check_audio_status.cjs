const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare('SELECT id, storage_path, duration_seconds, transcript FROM calls').all();

let onDiskUntranscribed = 0;
let onDiskTranscribed = 0;
let noDiskUntranscribed = 0;

for (const c of calls) {
  const hasDisk = Boolean(c.storage_path && fs.existsSync(c.storage_path));
  const hasTx = Boolean(c.transcript && c.transcript.trim().length > 20);
  if (hasDisk && !hasTx) onDiskUntranscribed++;
  else if (hasDisk && hasTx) onDiskTranscribed++;
  else if (!hasDisk && !hasTx) noDiskUntranscribed++;
}

console.log({ onDiskUntranscribed, onDiskTranscribed, noDiskUntranscribed });
