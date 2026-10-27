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
  s = s.replace(/double\s+([a-z0-9]+)/gi, (_, w) => {
    const d = SPOKEN_DIGITS[w] || w;
    return d + d;
  });
  s = s.replace(/triple\s+([a-z0-9]+)/gi, (_, w) => {
    const d = SPOKEN_DIGITS[w] || w;
    return d + d + d;
  });
  for (const [w, d] of Object.entries(SPOKEN_DIGITS)) {
    s = s.replace(new RegExp(`\\b${w}\\b`, 'gi'), d);
  }
  return s;
}

const trades = db.prepare('SELECT * FROM trades ORDER BY trade_time ASC, id ASC').all();
const calls = db.prepare('SELECT id, client_code, phone_number, customer_number, calling_number, call_time, call_date, duration_seconds, transcript FROM calls').all();

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
  if (dur > 0 && dur < 10) return { scrap: true, reason: 'duration < 10s' };
  if (!tr || tr.includes('[Silence') || tr.includes('[Inaudible')) return { scrap: true, reason: 'silence' };
  if (/voicemail|record your message|forwarded to|person you are trying to reach|switched off|not answering/i.test(lower)) return { scrap: true, reason: 'voicemail' };
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= 10 && words.every(w => /^(?:hello|sir|hi|ha|haan|ji|ye|ho|oh|yeah|okay|so)+$/i.test(w.replace(/[^a-zA-Z]/g, '')))) return { scrap: true, reason: 'unanswered greeting' };
  return { scrap: false };
}

const matchedPreOrders = new Map(); // callId -> { call, expectedUcc, trade }

for (const t of trades) {
  const rawP = (t.customer_number || t.client_number || t.phone_number || '').replace(/\D/g, '').slice(-10);
  const tradeSec = timeToSeconds(t.trade_time);
  const expectedUcc = (t.client || t.client_code || '').trim().toUpperCase();

  if (!rawP || rawP.length !== 10 || !callsByPhone.has(rawP)) continue;
  const clientCalls = callsByPhone.get(rawP);

  const validPriorCalls = [];
  for (const c of clientCalls) {
    if (isScrap(c).scrap) continue;
    const callSec = timeToSeconds(c.call_time);
    const delta = tradeSec - callSec;
    if (delta >= -30 && delta <= 7200) {
      validPriorCalls.push({ call: c, callSec, delta });
    }
  }

  if (validPriorCalls.length > 0) {
    validPriorCalls.sort((a, b) => a.delta - b.delta);
    const bestCall = validPriorCalls[0].call;
    if (!matchedPreOrders.has(bestCall.id)) {
      matchedPreOrders.set(bestCall.id, { call: bestCall, expectedUcc, trade: t });
    }
  }
}

console.log('Auditing Q2 on the', matchedPreOrders.size, 'Distinct Pre-Order Calls...');

let q2Pass = 0;
let q2Fail = 0;
const failures = [];

for (const [callId, { call, expectedUcc }] of matchedPreOrders) {
  const cleanExp = expectedUcc.replace(/[^A-Z0-9]/g, '');
  const prefix = cleanExp.slice(0, 3);
  const numPart = cleanExp.slice(3);
  const numNoZero = numPart.replace(/^0+/, '');

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

  // 4. Levenshtein <= 1
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
      failures.push({ id: callId, ucc: cleanExp, text: tr.slice(0, 150).replace(/\n/g, ' ') });
    }
  }
}

console.log('Q2 PASS:', q2Pass, `(${((q2Pass / matchedPreOrders.size) * 100).toFixed(1)}%)`);
console.log('Q2 FAIL:', q2Fail, `(${((q2Fail / matchedPreOrders.size) * 100).toFixed(1)}%)`);
console.log('\nSample Failures:');
failures.forEach(f => console.log('Call #' + f.id + ' [' + f.ucc + ']: ' + f.text));
