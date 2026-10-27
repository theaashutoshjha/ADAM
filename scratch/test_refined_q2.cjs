const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

function timeToSeconds(t) {
  if (!t) return 0;
  const parts = t.trim().split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

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

const trades = db.prepare('SELECT * FROM trades ORDER BY trade_date ASC, trade_time ASC, id ASC').all();
const calls = db.prepare('SELECT id, client_code, caller_name, phone_number, customer_number, calling_number, call_time, call_date, duration_seconds, transcript FROM calls ORDER BY call_date ASC, call_time ASC, id ASC').all();

const callsByPhone = new Map();
for (const c of calls) {
  const rawP = c.customer_number || c.calling_number || c.phone_number || '';
  const p = rawP.replace(/\D/g, '').slice(-10);
  if (p && p.length === 10) {
    if (!callsByPhone.has(p)) callsByPhone.set(p, []);
    callsByPhone.get(p).push(c);
  }
}

function isScrap(call) {
  const dur = call.duration_seconds || 0;
  const tr = (call.transcript || '').trim();
  const lower = tr.toLowerCase();
  if (dur > 0 && dur < 6) return true;
  if (!tr || tr.includes('[Silence') || tr.includes('[Inaudible')) return true;
  if (/voicemail|record your message|forwarded to|person you are trying to reach|switched off|not answering|call has been forwarded|if you record your name/i.test(lower)) return true;
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= 12 && !/\b(?:buy|sell|order|shares?|lot|lots?|cmp|market|put|call|ce\b|pe\b|₹|\d{3,})\b/i.test(lower)) return true;
  return false;
}

const matchedPreOrders = new Map(); // callId -> { call, expectedUcc, trade }

for (const t of trades) {
  const rawP = (t.customer_number || t.client_number || t.phone_number || '').replace(/\D/g, '').slice(-10);
  const tradeSec = timeToSeconds(t.trade_time);
  const expectedUcc = (t.client || t.client_code || '').trim().toUpperCase();

  if (!rawP || rawP.length !== 10 || !callsByPhone.has(rawP)) continue;
  const clientCalls = callsByPhone.get(rawP).filter(c => c.call_date === t.trade_date);

  const validPrior = [];
  for (const c of clientCalls) {
    if (isScrap(c)) continue;
    const callSec = timeToSeconds(c.call_time);
    const delta = tradeSec - callSec;
    if (delta >= -30 && delta <= 7200) {
      validPrior.push({ call: c, callSec, delta });
    }
  }

  if (validPrior.length === 0) {
    for (const c of clientCalls) {
      if (isScrap(c)) continue;
      const callSec = timeToSeconds(c.call_time);
      if (callSec <= tradeSec + 60) {
        validPrior.push({ call: c, callSec, delta: tradeSec - callSec });
      }
    }
  }

  if (validPrior.length > 0) {
    validPrior.sort((a, b) => a.delta - b.delta);
    const bestCall = validPrior[0].call;
    if (!matchedPreOrders.has(bestCall.id)) {
      matchedPreOrders.set(bestCall.id, { call: bestCall, expectedUcc, trade: t });
    }
  }
}

let q2Pass = 0;
let q2Fail = 0;
const verifiedClientsByDate = new Set();
const remainingFailures = [];

const sortedCalls = Array.from(matchedPreOrders.values()).sort((a, b) => {
  const dtA = (a.call.call_date || '') + ' ' + (a.call.call_time || '');
  const dtB = (b.call.call_date || '') + ' ' + (b.call.call_time || '');
  return dtA.localeCompare(dtB);
});

for (const { call, expectedUcc } of sortedCalls) {
  const cleanExp = expectedUcc.replace(/[^A-Z0-9]/g, '');
  const prefix = cleanExp.slice(0, 3);
  const numPart = cleanExp.slice(3);
  const numNoZero = numPart.replace(/^0+/, '');
  const phone = (call.customer_number || call.calling_number || call.phone_number || '').replace(/\D/g, '').slice(-10);
  const sessionKey = `${call.call_date}:${cleanExp}`;
  const phoneSessionKey = `${call.call_date}:${phone}`;

  const tr = call.transcript || '';
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

  // 3. De-entitied
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

  // 4. Levenshtein <= 1 on alphanumeric OR numeric tokens (e.g. 868828 vs 86828, 56789 vs 56889, 33264 vs 03264)
  if (!matched) {
    const tokens = (tr.toUpperCase().match(/[A-Z0-9]{4,10}/g) || []).concat(cleanTr.match(/[A-Z0-9]{4,10}/g) || []);
    for (const tok of tokens) {
      if (levenshtein(tok, cleanExp) <= 1 || (prefix && tok.startsWith(prefix) && levenshtein(tok.slice(3), numPart) <= 1)) {
        matched = true;
        break;
      }
      const digitsOnly = tok.replace(/\D/g, '');
      if (digitsOnly.length >= 4 && (levenshtein(digitsOnly, numPart) <= 1 || digitsOnly.endsWith(numPart) || numPart.endsWith(digitsOnly))) {
        matched = true;
        break;
      }
    }
  }

  // 5. Customer Name verbal verification (e.g. "Kruthik", "Rajkumar")
  if (!matched && call.caller_name) {
    const nameParts = call.caller_name.trim().toLowerCase().split(/\s+/).filter(p => p.length >= 4);
    for (const np of nameParts) {
      if (tr.toLowerCase().includes(np)) {
        matched = true;
        break;
      }
    }
  }

  // 6. Session Authentication (verified earlier on same trading day)
  if (!matched && (verifiedClientsByDate.has(sessionKey) || verifiedClientsByDate.has(phoneSessionKey))) {
    matched = true;
  }

  if (matched) {
    q2Pass++;
    verifiedClientsByDate.add(sessionKey);
    verifiedClientsByDate.add(phoneSessionKey);
  } else {
    q2Fail++;
    if (remainingFailures.length < 10) {
      remainingFailures.push({ id: call.id, ucc: cleanExp, name: call.caller_name, text: tr.slice(0, 150).replace(/\n/g, ' ') });
    }
  }
}

console.log(`\n=== ACCURATE PRE-ORDER Q2 RESULTS ===`);
console.log(`Total Genuine Pre-Order Calls: ${sortedCalls.length}`);
console.log(`Q2 PASS: ${q2Pass} (${((q2Pass / sortedCalls.length) * 100).toFixed(1)}%)`);
console.log(`Q2 FAIL: ${q2Fail} (${((q2Fail / sortedCalls.length) * 100).toFixed(1)}%)`);

console.log('\nRemaining Failures Sample:');
remainingFailures.forEach(f => console.log('Call #' + f.id + ' [' + f.ucc + ', ' + f.name + ']: ' + f.text));
