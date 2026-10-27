const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// All 1033 calls with transcripts
const all1033 = db.prepare(`
  SELECT id, client_code, transcript, duration_seconds, classification, scrap_reason
  FROM calls
  WHERE transcript IS NOT NULL AND length(trim(transcript)) > 0
  ORDER BY id ASC
`).all();

// The 550 calls matched in trades
const matched550 = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds, c.classification
  FROM calls c
  WHERE c.id IN (SELECT DISTINCT matched_call_id FROM trades WHERE matched_call_id IS NOT NULL)
  ORDER BY c.id ASC
`).all();

console.log('=== ANALYSIS OF ALL 1033 CALLS & 550 TRADE-LINKED CALLS ===');
console.log('Total calls with transcripts:', all1033.length);
console.log('Total calls linked in trades.matched_call_id:', matched550.length);

// Analyze classifications of the 550 calls in test_550_matched.cjs
const scrapIn550 = [];
const genuinePreOrdersIn550 = [];
const nonPreOrdersIn550 = [];

for (const c of matched550) {
  const tr = (c.transcript || '').trim();
  const lower = tr.toLowerCase();
  const isSilent = !tr || tr.includes('[Silence') || tr.includes('[Inaudible');
  const isVoicemail = /voicemail|record your message|person you are trying to reach|not available at the tone/i.test(lower);
  const isShortGreeting = tr.split(/\s+/).length <= 10 && !/(?:buy|sell|order|shares|lot|lots|cmp|market)/i.test(lower);

  if (isSilent || isVoicemail || isShortGreeting) {
    scrapIn550.push({ id: c.id, code: c.client_code, reason: isSilent ? 'Silence' : isVoicemail ? 'Voicemail' : 'Short Greeting', tr: tr.slice(0, 80) });
  } else {
    genuinePreOrdersIn550.push(c);
  }
}

console.log('\n--- 550 Matched Calls Breakdown ---');
console.log('Scrap / Voicemail / Dead Air in 550:', scrapIn550.length);
console.log('Genuine Conversational Calls in 550:', genuinePreOrdersIn550.length);

console.log('\nSample Scrap calls that were linked to trades:');
scrapIn550.slice(0, 10).forEach(s => console.log('Call #' + s.id + ' [' + s.code + ']: ' + s.reason + ' -> ' + s.tr));
