const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const SPOKEN_DIGITS = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9'
};

function normalizeWordsToDigits(text) {
  let s = text.toLowerCase();
  s = s.replace(/double\s+([a-z0-9]+)/gi, (_, w) => (SPOKEN_DIGITS[w] || w) + (SPOKEN_DIGITS[w] || w));
  s = s.replace(/triple\s+([a-z0-9]+)/gi, (_, w) => (SPOKEN_DIGITS[w] || w) + (SPOKEN_DIGITS[w] || w) + (SPOKEN_DIGITS[w] || w));
  for (const [w, d] of Object.entries(SPOKEN_DIGITS)) {
    s = s.replace(new RegExp(`\\b${w}\\b`, 'gi'), d);
  }
  return s;
}

// Fetch all 1033 calls currently classified as pre_order
const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds, c.matched_trade_id
  FROM calls c
  WHERE c.call_type = 'pre_order' OR c.classification = 'PRE_ORDER'
  ORDER BY c.id ASC
`).all();

console.log('Total calls labeled pre_order:', calls.length);

let orderCalls = [];
let nonOrderTelephonyCalls = [];

const ORDER_INTENT_REGEX = /\b(?:buy|sell|order|shares?|lot|lots?|cmp|market\s*price|limit|quantity|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do|put\s*order|exit|exited|liquidate|redeem|invest|profit|booked|target|stoploss|trade|call\s*option|put\s*option|ce\b|pe\b|nifty|banknifty|sensex|mcx|future|option)\b/i;

for (const c of calls) {
  const tr = (c.transcript || '').trim();
  const lower = tr.toLowerCase();
  
  // 1. Telephony scrap check
  if (!tr || tr.includes('[Silence') || tr.includes('[Inaudible')) {
    nonOrderTelephonyCalls.push({ id: c.id, reason: 'silence' });
    continue;
  }
  if (/voicemail|forwarded to|record your message|person you are trying to reach|switched off|not answering/i.test(lower)) {
    nonOrderTelephonyCalls.push({ id: c.id, reason: 'voicemail' });
    continue;
  }
  const cleanSpeech = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleanSpeech.split(' ').filter(Boolean);
  
  if (words.length <= 15 && words.every(w => /^(?:hello|sir|hi|ha|haan|ji|ye|ho|oh|yeah|okay|so)+$/i.test(w.replace(/[^a-zA-Z]/g, '')))) {
    nonOrderTelephonyCalls.push({ id: c.id, reason: 'unanswered greeting' });
    continue;
  }
  
  if (words.length <= 15 && /बाद में|call you back|call back|later|call me back/i.test(lower) && !ORDER_INTENT_REGEX.test(lower)) {
    nonOrderTelephonyCalls.push({ id: c.id, reason: 'callback promise' });
    continue;
  }

  // Check if trading order terms exist
  if (ORDER_INTENT_REGEX.test(lower)) {
    orderCalls.push({ ...c, cleanSpeech, words: words.length });
  } else {
    nonOrderTelephonyCalls.push({ id: c.id, reason: 'no order/trade dialogue', text: cleanSpeech.slice(0, 80) });
  }
}

console.log('--- CLASSIFICATION BREAKDOWN ---');
console.log('Genuine Order Placement Discussions:', orderCalls.length);
console.log('Non-Order Telephony Calls (Scrap / Callbacks / Dead Air):', nonOrderTelephonyCalls.length);

// Now evaluate Q2 on genuine order placement calls
let q2Pass = 0;
let q2Fail = 0;
const failures = [];

for (const c of orderCalls) {
  const expectedUcc = (c.client_code || '').trim().toUpperCase();
  const cleanExp = expectedUcc.replace(/[^A-Z0-9]/g, '');
  const prefix = cleanExp.slice(0, 3);
  const numPart = cleanExp.slice(3);
  const numNoZero = numPart.replace(/^0+/, '');

  const tr = c.cleanSpeech;
  const cleanTr = tr.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normWords = normalizeWordsToDigits(tr).toUpperCase().replace(/[^A-Z0-9]/g, '');

  let matched = false;

  // 1. Exact or Word Normalized
  if (cleanTr.includes(cleanExp) || normWords.includes(cleanExp)) {
    matched = true;
  }

  // 2. Spoken Numeric with Cue or direct digits
  if (!matched && numPart.length >= 4) {
    const cueRegex = new RegExp(`(?:client|trading|account|your)?\\s*(?:code|id|ucc|number)?\\s*[:\\-]?[^\\d\\n]{0,15}\\b(?:[A-Z]{2,4}\\s*)?0?(${numPart}|${numNoZero})\\b`, 'i');
    if (cueRegex.test(tr) || cueRegex.test(normWords) || cleanTr.includes(numPart) || normWords.includes(numPart) || cleanTr.includes(numNoZero)) {
      matched = true;
    }
  }

  // 3. De-entitied (Reversing currency/time mangling)
  if (!matched) {
    const deEntitied = tr.toUpperCase()
      .replace(/₹\s*(\d+)/g, '$1')
      .replace(/FIVE\s*,?\s*SIX\s*,?\s*(\d+)/g, '56$1')
      .replace(/(\d+)\s*,\s*(\d+)/g, '$1$2')
      .replace(/[^A-Z0-9]/g, '');
    if (deEntitied.includes(cleanExp) || (numPart.length >= 4 && deEntitied.includes(numPart))) {
      matched = true;
    }
  }

  // 4. Levenshtein <= 1 on tokens
  if (!matched) {
    const tokens = tr.match(/[A-Z0-9]{5,10}/gi) || [];
    for (const tok of tokens) {
      const up = tok.toUpperCase();
      if (levenshtein(up, cleanExp) <= 1 || (prefix && up.startsWith(prefix) && levenshtein(up.slice(3), numPart) <= 1)) {
        matched = true;
        break;
      }
    }
  }

  if (matched) {
    q2Pass++;
  } else {
    q2Fail++;
    if (failures.length < 10) {
      failures.push({ id: c.id, ucc: cleanExp, text: tr.slice(0, 150).replace(/\n/g, ' ') });
    }
  }
}

console.log('\n=== Q2 ACCURACY ON GENUINE ORDER PLACEMENT CALLS ===');
console.log('Genuine Order Placement Calls Audited:', orderCalls.length);
console.log('Q2 PASS:', q2Pass, `(${((q2Pass / orderCalls.length) * 100).toFixed(1)}%)`);
console.log('Q2 FAIL:', q2Fail, `(${((q2Fail / orderCalls.length) * 100).toFixed(1)}%)`);
console.log('\nSample Failures:');
failures.forEach(f => console.log('Call #' + f.id + ' [' + f.ucc + ']: ' + f.text));
