const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.caller_name, c.dealer_name, c.calling_number, c.customer_number,
         s.q2_status, s.q2_evidence, s.score, s.is_fatal
  FROM calls c
  JOIN scorecards s ON c.id = s.call_id
  WHERE c.call_type = 'pre_order'
`).all();

console.log(`Analyzing ${calls.length} pre-order calls for Client Code / UCC spoken...`);

// Let's inspect how UCCs are formatted in client_code
const uccSet = new Set(calls.map(c => c.client_code).filter(Boolean));
console.log(`Unique client codes across pre-orders: ${uccSet.size}`);
console.log('Sample client codes:', Array.from(uccSet).slice(0, 15));

// Categories of transcripts
let totalSilence = 0;
let totalVoicemail = 0;
let totalShortGreetingOnly = 0; // "Hello? Hello?"
let totalConversation = 0;

for (const c of calls) {
  const t = (c.transcript || '').trim().toLowerCase();
  if (t.length === 0 || t.includes('[silence') || t.includes('no speech detected')) {
    totalSilence++;
  } else if (t.includes('voicemail') || t.includes('record your message') || t.includes('forwarded to')) {
    totalVoicemail++;
  } else if (t.length < 35 && (t.includes('hello') || t.includes('sir') || t.includes('haan'))) {
    totalShortGreetingOnly++;
  } else {
    totalConversation++;
  }
}

console.log({
  totalSilence,
  totalVoicemail,
  totalShortGreetingOnly,
  totalConversation
});
