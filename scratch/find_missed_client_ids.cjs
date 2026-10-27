const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const failCalls = db.prepare(`
  SELECT s.call_id, s.client_code, c.transcript, c.duration_seconds
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL'
`).all();

console.log(`Inspecting ${failCalls.length} Q2 FAIL calls to see if ANY client IDs were missed...`);

// Unique target client codes
const allClientCodes = Array.from(new Set(failCalls.map(c => c.client_code).filter(Boolean)));
console.log(`Unique target client codes among fails: ${allClientCodes.length}`);

const suspiciousFails = [];

for (const c of failCalls) {
  const t = (c.transcript || '').toLowerCase();
  const rawT = c.transcript || '';
  const targetUcc = (c.client_code || '').trim().toUpperCase();
  const numPart = targetUcc.slice(3);
  const prefix = targetUcc.slice(0, 3);

  // Check if any numbers or code words appear
  const hasCodeWord = /(?:client|code|account|id|a\/c|ucc|folio|card|number|line|credit|plain|pin)/i.test(t);
  
  // Check if target numPart (or digits) appear with spaces or slight mutations
  // e.g. 5 digits with a space inside (e.g. "62 920", "6 2 9 2 0")
  let spacedNum = '';
  if (numPart.length >= 4) {
    const chars = numPart.split('');
    const regex = new RegExp(chars.join('[\\s,\\.\\-]*'), 'i');
    if (regex.test(t)) {
      spacedNum = 'Spaced digits: ' + numPart;
    }
  }

  // Check if any prefix appears
  const hasPrefix = /(?:pwa|pw8|pwo|3w0|3w|wia|wie|wau|wad|24ku|wid|bid|vid|wig|wag|aad|w8|wic|pwd|pwl)/i.test(t);

  // Check if 4 or 5 digits appear anywhere in text
  const digitsMatches = t.match(/\b\d{4,6}\b/g) || [];

  if (hasCodeWord && (hasPrefix || spacedNum || digitsMatches.length > 0)) {
    suspiciousFails.push({
      callId: c.call_id,
      targetUcc,
      reason: `hasCodeWord: true, hasPrefix: ${hasPrefix}, spacedNum: ${Boolean(spacedNum)}, digits: ${digitsMatches.join(',')}`,
      transcript: rawT
    });
  }
}

console.log(`Suspicious fails that might have a client ID mentioned: ${suspiciousFails.length}`);
console.log('\n--- First 15 Suspicious Fails ---');
for (const s of suspiciousFails.slice(0, 15)) {
  console.log(`[Call #${s.callId}] Target UCC: ${s.targetUcc} | Reason: ${s.reason}`);
  console.log(`Transcript: "${s.transcript}"\n`);
}
