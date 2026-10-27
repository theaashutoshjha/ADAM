const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

// Direct query

const calls = db.prepare(`
  SELECT id, client_code, transcript, duration_seconds
  FROM calls
  WHERE call_type = 'pre_order'
`).all();

// Filter calls with decent length (> 100 chars) that have NO UCC
const noUccCalls = [];
for (const c of calls) {
  const t = (c.transcript || '').toLowerCase();
  const ucc = (c.client_code || '').trim().toUpperCase();
  const numPart = ucc.slice(3);

  // If UCC or numPart or common prefixes appear, skip
  if (ucc && t.includes(ucc.toLowerCase())) continue;
  if (numPart && numPart.length >= 4 && t.includes(numPart)) continue;
  if (t.includes('[silence') || t.includes('voicemail') || t.includes('forwarded')) continue;

  if (c.transcript && c.transcript.length > 80) {
    noUccCalls.push(c);
  }
}

console.log(`Total real conversations with NO UCC spoken: ${noUccCalls.length}`);
console.log('\n--- 10 Sample Real Conversations with NO UCC spoken (Real Q2 Fails) ---');
for (const c of noUccCalls.slice(0, 10)) {
  console.log(`[Call #${c.id}] Target UCC: ${c.client_code} | Duration: ${c.duration_seconds}s`);
  console.log(`Transcript: "${c.transcript}"\n`);
}
