const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, s.q2_status, s.q2_evidence, c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'PASS'
`).all();

console.log(`Inspecting all ${rows.length} Q2 PASS scorecards...`);

const strongPasses = [];
const borderlinePasses = [];

for (const r of rows) {
  const t = (r.transcript || '').toLowerCase();
  const ucc = (r.client_code || '').trim().toUpperCase();
  const numPart = ucc.slice(3);
  const prefix = ucc.slice(0, 3);

  // Strong pass criteria:
  // Must have explicit mention of (client/code/account/id/trading/ucc/line code) OR full prefix+number
  const hasExplicitUccCue = /(?:client\s*(?:code|id|no)?|trading\s*code|credit\s*code|line\s*code|plain|account\s*(?:is|no|number)?|a\/c|your\s*code|user\s*id|ucc)/i.test(t);
  const hasPrefixWithNum = new RegExp(`(?:${prefix}|pw8|3w0|wau|wag|aad|via|vid)\\D{0,5}${numPart}`, 'i').test(t);
  const hasExactUcc = t.replace(/[^a-z0-9]/g, '').includes(ucc.toLowerCase());

  if (hasExactUcc || (hasExplicitUccCue && t.includes(numPart)) || hasPrefixWithNum) {
    strongPasses.push(r);
  } else {
    borderlinePasses.push(r);
  }
}

console.log(`Strong / Indisputable Q2 PASS: ${strongPasses.length}`);
console.log(`Borderline / Suspicious Q2 PASS: ${borderlinePasses.length}`);

console.log('\n--- BORDERLINE / SUSPICIOUS Q2 PASSES ---');
for (const b of borderlinePasses) {
  console.log(`[Call #${b.call_id}] Target UCC: ${b.client_code}`);
  console.log(`Evidence: ${b.q2_evidence}`);
  console.log(`Transcript: "${b.transcript}"\n`);
}
