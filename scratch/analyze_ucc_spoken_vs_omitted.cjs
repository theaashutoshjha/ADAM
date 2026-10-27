const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript
  FROM calls c
  WHERE c.call_type = 'pre_order'
`).all();

console.log('Inspecting UCC mentions across all 1033 pre-order calls...');

let codeWordMentions = 0;
let explicitCodeFound = 0;
let digitMatches = 0;
let sampleCodeMentions = [];
let sampleNoCodeConversations = [];

for (const c of calls) {
  const t = (c.transcript || '').trim();
  const lowerT = t.toLowerCase();
  const ucc = (c.client_code || '').trim().toUpperCase();
  const numPart = ucc.replace(/^[A-Z]+/, '');
  const prefix = ucc.slice(0, 3);

  const hasCodeWord = /\b(?:client|code|account|acc|id|ucc)\b/i.test(t);
  if (hasCodeWord) codeWordMentions++;

  // Check if transcript contains full UCC or phonetic prefix + numPart
  const cleanT = lowerT.replace(/[^a-z0-9]/g, '');
  const cleanUcc = ucc.toLowerCase().replace(/[^a-z0-9]/g, '');

  let matched = false;
  let matchReason = '';

  if (cleanT.includes(cleanUcc)) {
    matched = true;
    matchReason = `Exact UCC: ${ucc}`;
  } else if (numPart && cleanT.includes(numPart)) {
    matched = true;
    matchReason = `Number Part: ${numPart}`;
  }

  if (matched) {
    explicitCodeFound++;
    if (sampleCodeMentions.length < 15) {
      sampleCodeMentions.push({ id: c.id, ucc, matchReason, transcript: t });
    }
  } else if (t.length > 100 && sampleNoCodeConversations.length < 10) {
    sampleNoCodeConversations.push({ id: c.id, ucc, transcript: t });
  }
}

console.log(`Conversations mentioning words "code/client/account/id": ${codeWordMentions}`);
console.log(`Calls where target UCC or its digits appear in transcript: ${explicitCodeFound}`);
console.log(`Calls where target UCC does NOT appear: ${calls.length - explicitCodeFound}`);

console.log('\n--- Sample Calls with Target Code/Digits Found (First 5) ---');
for (const s of sampleCodeMentions.slice(0, 5)) {
  console.log(`[Call ${s.id}] Target UCC: ${s.ucc} (${s.matchReason})`);
  console.log(`Transcript: "${s.transcript}"\n`);
}

console.log('\n--- Sample Full Conversations WHERE NO UCC IS SPOKEN (First 5) ---');
for (const s of sampleNoCodeConversations.slice(0, 5)) {
  console.log(`[Call ${s.id}] Target UCC: ${s.ucc}`);
  console.log(`Transcript: "${s.transcript}"\n`);
}
