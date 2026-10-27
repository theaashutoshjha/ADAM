const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds
  FROM calls c
  WHERE c.call_type = 'pre_order' OR c.classification = 'PRE_ORDER' OR c.matched_trade_id IS NOT NULL
  ORDER BY c.id ASC
`).all();

let totalCalls = calls.length; // 1,033
let scrapCount = 0;
let scrapReasons = {
  silence: 0,
  voicemail: 0,
  unanswered_greeting: 0,
  one_word_hangup: 0,
  callback_promise_only: 0
};

let genuineConversations = [];

for (const c of calls) {
  const tr = (c.transcript || '').trim();
  const lowerT = tr.toLowerCase();

  // 1. Silence / Carrier unreadable
  if (tr.length === 0 || tr.includes('[Silence') || tr.includes('[Inaudible')) {
    scrapCount++;
    scrapReasons.silence++;
    continue;
  }

  // 2. Automated voicemail / IVR prompts
  if (/voicemail|forwarded to|record your message|person you are trying to reach|switched off|not answering|call has been forwarded/i.test(lowerT)) {
    scrapCount++;
    scrapReasons.voicemail++;
    continue;
  }

  // 3. Unanswered greeting: e.g. "Hello? Hello?", "Hello? Am I audible?", "Hello sir"
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, '').trim().split(/\s+/).filter(Boolean);
  const cleanSpeech = words.join(' ').toLowerCase();

  if (words.length <= 5 && /^(?:hello\??|sir,?|\.|\bhi\b)+$/i.test(cleanSpeech)) {
    scrapCount++;
    scrapReasons.unanswered_greeting++;
    continue;
  }

  // 4. One word hang-up
  if (words.length <= 2) {
    scrapCount++;
    scrapReasons.one_word_hangup++;
    continue;
  }

  // 5. Callback promise with no trading conversation: "बाद में बुलाता हूं", "I will call you back"
  if (words.length <= 12 && /बाद में|call you back|call back|later/i.test(cleanSpeech) && !/\b(?:buy|sell|order|shares|lot|lots|cmp|market)\b/i.test(cleanSpeech)) {
    scrapCount++;
    scrapReasons.callback_promise_only++;
    continue;
  }

  // If none of the above, it is a genuine conversational call
  genuineConversations.push(c);
}

console.log('=== SEPARATION OF SCRAP CALLS VS GENUINE PRE-ORDER CONVERSATIONS ===');
console.log(`Total Pre-Order Call Records in DB: ${totalCalls}`);
console.log(`Total Scrap Calls (Voicemails, Dead Lines, Ring-Hangups): ${scrapCount}`);
console.log('Scrap Breakdown:', scrapReasons);
console.log(`GENUINE TWO-PARTY CONVERSATIONS: ${genuineConversations.length}`);

// Now let's test Q2 pass rate strictly on the GENUINE CONVERSATIONS!
let genuineQ2Pass = 0;
let genuineQ2Fail = 0;
const sampleGenuineFails = [];

for (const c of genuineConversations) {
  const tr = c.transcript.toUpperCase();
  const code = (c.client_code || '').trim().toUpperCase();
  const numPart = code.slice(3);

  // Check UCC in dialogue
  const trNoPunct = tr.replace(/[^A-Z0-9]/g, '');
  const hasExact = trNoPunct.includes(code);
  const hasSpokenDigits = numPart.length >= 4 && (tr.includes(numPart) || tr.includes(numPart.replace(/^0+/, '')));
  const hasUccCue = /(?:CLIENT|UCC|CODE|TRADING|ACCOUNT)\D{0,15}\d{4,6}/i.test(tr);
  const hasPhoneticPrefix = /(?:WIA|WID|WIG|PWA|PWD|WIC|WIF|VIA|VID|VIG|WIN|WIJ|PWO|VWA)/i.test(tr);

  if (hasExact || (hasPhoneticPrefix && hasSpokenDigits) || (hasUccCue && hasSpokenDigits)) {
    genuineQ2Pass++;
  } else {
    genuineQ2Fail++;
    if (sampleGenuineFails.length < 5) {
      sampleGenuineFails.push({ id: c.id, code, tr: c.transcript.slice(0, 150).replace(/\n/g, ' ') });
    }
  }
}

console.log(`\n=== Q2 ACCURACY ON GENUINE CONVERSATIONS ===`);
console.log(`Genuine Conversations Audited: ${genuineConversations.length}`);
console.log(`Q2 PASS: ${genuineQ2Pass} (${((genuineQ2Pass / genuineConversations.length) * 100).toFixed(1)}%)`);
console.log(`Q2 FAIL: ${genuineQ2Fail} (${((genuineQ2Fail / genuineConversations.length) * 100).toFixed(1)}%)`);

console.log('\nSample Genuine Fails:');
sampleGenuineFails.forEach(f => {
  console.log(`Call #${f.id} [${f.code}]: "${f.tr}"`);
});
