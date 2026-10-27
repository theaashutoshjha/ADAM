const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript
  FROM calls c
  WHERE c.call_type = 'pre_order'
`).all();

console.log('--- Analyzing phonetic variations of UCC confirmations ---');

// Common ASR mishearings for "Client code / Account / UCC":
// "line code", "credit code", "plane code", "plain code", "blind code", "lying code", "mine code",
// "atconte", "account", "client", "code", "card", "id"
const codeCueRegex = /\b(?:client|line\s*code|credit\s*code|plain\s*code|plane\s*code|blind\s*code|lying\s*code|mine\s*code|atconte|account|ucc|id\b|code\b|your\s*code)/i;

const cueCalls = [];
for (const c of calls) {
  const t = (c.transcript || '').trim();
  if (codeCueRegex.test(t)) {
    cueCalls.push(c);
  }
}

console.log(`Total calls with explicit UCC verbal cue (client/line code/credit code/account/etc): ${cueCalls.length}`);

// Print 20 examples to study how dealers speak UCC
for (const c of cueCalls.slice(0, 20)) {
  const m = c.transcript.match(new RegExp(`(?:.{0,40}(?:${codeCueRegex.source}).{0,60})`, 'i'));
  console.log(`[Call ${c.id}] Target UCC: ${c.client_code}`);
  console.log(`  Snippet: "${m ? m[0].trim() : ''}"`);
  console.log(`  Full: "${c.transcript}"\n`);
}
