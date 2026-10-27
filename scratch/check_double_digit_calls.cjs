const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, client_code, transcript, duration_seconds
  FROM calls
  WHERE call_type = 'pre_order'
  ORDER BY id ASC
`).all();

console.log(`Inspecting all 1033 calls for ASR phonetic artifacts like "Double digit", "W", numbers...`);

const matches = [];

for (const c of calls) {
  const t = (c.transcript || '');
  const lowerT = t.toLowerCase();
  const ucc = (c.client_code || '').trim().toUpperCase();
  const numPart = ucc.slice(3); // e.g. 68332
  const prefix = ucc.slice(0, 3); // WIG

  // Check if "double digit" or "double" or "digit" appears
  if (/double\s*digit/i.test(t)) {
    matches.push({ id: c.id, ucc, type: 'DOUBLE_DIGIT', transcript: t });
  }
}

console.log(`Calls with "double digit": ${matches.length}`);
for (const m of matches) {
  console.log(`[Call ${m.id}] UCC: ${m.ucc}`);
  console.log(`Transcript: "${m.transcript}"\n`);
}
