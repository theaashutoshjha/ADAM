const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, s.q2_status, s.q2_evidence, c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'PASS'
`).all();

let strong = 0;
let borderline = 0;
const blList = [];

for (const r of rows) {
  const t = (r.transcript || '').toLowerCase();
  const ucc = (r.client_code || '').trim().toUpperCase();
  const numPart = ucc.slice(3);
  const prefix = ucc.slice(0, 3);

  const hasExplicitUccCue = /(?:client\s*(?:code|id|no)?|trading\s*code|credit\s*code|line\s*code|plain|account\s*(?:is|no|number)?|a\/c|your\s*code|user\s*id|ucc|current\s*id)/i.test(t);
  const hasPrefixWithNum = new RegExp(`(?:${prefix}|pw8|3w0|wau|wag|aad|via|vid|wae|waa)\\D{0,5}${numPart}`, 'i').test(t);
  const hasExactUcc = t.replace(/[^a-z0-9]/g, '').includes(ucc.toLowerCase());

  if (hasExactUcc || (hasExplicitUccCue && t.includes(numPart)) || hasPrefixWithNum) {
    strong++;
  } else {
    borderline++;
    blList.push(r);
  }
}

console.log({ totalPass: rows.length, strong, borderline });
if (blList.length > 0) {
  console.log('\n--- ALL BORDERLINE CALLS ---');
  for (const b of blList) {
    console.log(`[Call #${b.call_id}] Target UCC: ${b.client_code}`);
    console.log(`Transcript: "${b.transcript}"\n`);
  }
}
