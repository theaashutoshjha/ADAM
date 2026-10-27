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

function resolveUcc(transcript, expectedUcc) {
  if (!expectedUcc) return { matched: false, reason: 'No expected UCC' };
  const cleanExp = expectedUcc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefix = cleanExp.slice(0, 3);
  const numPart = cleanExp.slice(3);
  const numWithoutZeros = numPart.replace(/^0+/, '');

  const tr = transcript || '';
  const cleanTr = tr.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Exact Match
  if (cleanTr.includes(cleanExp)) {
    return { matched: true, type: 'EXACT', evidence: cleanExp };
  }

  // 2. Word-normalized Match ("eight six eight eight two eight")
  const normWords = normalizeWordsToDigits(tr).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normWords.includes(cleanExp)) {
    return { matched: true, type: 'WORD_NORM_EXACT', evidence: cleanExp };
  }

  // 3. Spoken Numeric UCC with Verbal Cue (e.g. "Your code is 04415", "Client code is 03264")
  const cueRegex = new RegExp(
    `(?:client|trading|account|your)?\\s*(?:code|id|ucc|number)?\\s*[:\\-]?[^\\d\\n]{0,15}\\b(?:[A-Z]{2,4}\\s*)?0?(${numPart}|${numWithoutZeros})\\b`,
    'i'
  );
  if (cueRegex.test(tr) || cueRegex.test(normWords)) {
    return { matched: true, type: 'SPOKEN_NUMERIC_CUE', evidence: numPart };
  }

  // Direct numeric digits match if >= 4 digits
  if (numPart.length >= 4 && (cleanTr.includes(numPart) || normWords.includes(numPart))) {
    return { matched: true, type: 'NUMERIC_PART', evidence: numPart };
  }
  if (numWithoutZeros.length >= 4 && (cleanTr.includes(numWithoutZeros) || normWords.includes(numWithoutZeros))) {
    return { matched: true, type: 'NUMERIC_NO_ZERO', evidence: numWithoutZeros };
  }

  // 4. Entity De-mangling (Reversing currency/time artifacts)
  const deEntitied = tr.toUpperCase()
    .replace(/₹\s*(\d+)/g, '$1')
    .replace(/FIVE\s*,?\s*SIX\s*,?\s*(\d+)/g, '56$1')
    .replace(/(\d+)\s*,\s*(\d+)/g, '$1$2');
  const cleanDeEntitied = deEntitied.replace(/[^A-Z0-9]/g, '');
  if (cleanDeEntitied.includes(cleanExp) || (numPart.length >= 4 && cleanDeEntitied.includes(numPart))) {
    return { matched: true, type: 'DE_ENTITIED', evidence: numPart };
  }

  // 5. Levenshtein Distance <= 1 Tolerance on Alphanumeric Tokens
  const tokens = tr.match(/[A-Z0-9]{5,10}/gi) || [];
  for (const t of tokens) {
    const upT = t.toUpperCase();
    if (levenshtein(upT, cleanExp) <= 1) {
      return { matched: true, type: 'FUZZY_LEV1', evidence: upT };
    }
    if (prefix && upT.startsWith(prefix) && levenshtein(upT.slice(3), numPart) <= 1) {
      return { matched: true, type: 'FUZZY_PREFIX_NUM', evidence: upT };
    }
  }

  return { matched: false, reason: 'UCC not found in dialogue' };
}

// Test on all calls that have trades!
const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds
  FROM calls c
  WHERE c.call_type = 'pre_order' OR c.classification = 'PRE_ORDER'
`).all();

let passCount = 0;
let failCount = 0;
let scrapDetected = 0;
let typesCount = {};

for (const c of calls) {
  const tr = (c.transcript || '').trim();
  const lower = tr.toLowerCase();
  
  // Scrap check
  const isSilence = !tr || tr.includes('[Silence') || tr.includes('[Inaudible');
  const isVoicemail = /voicemail|forwarded to|record your message|person you are trying to reach|switched off|not answering/i.test(lower);
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const isUnanswered = words.length <= 15 && words.every(w => /^(?:hello|sir|hi|ha|haan|ji|ye|ho|oh|yeah|okay|so)+$/i.test(w.replace(/[^a-zA-Z]/g, '')));
  
  if (isSilence || isVoicemail || isUnanswered) {
    scrapDetected++;
    continue;
  }

  const res = resolveUcc(c.transcript, c.client_code);
  if (res.matched) {
    passCount++;
    typesCount[res.type] = (typesCount[res.type] || 0) + 1;
  } else {
    failCount++;
  }
}

console.log('=== UCC RESOLUTION ON GENUINE CONVERSATIONS ===');
console.log('Total calls evaluated:', passCount + failCount);
console.log('Scrap detected (voicemail/silence/unanswered):', scrapDetected);
console.log('PASS Count:', passCount, `(${((passCount / (passCount + failCount)) * 100).toFixed(1)}%)`);
console.log('FAIL Count:', failCount, `(${((failCount / (passCount + failCount)) * 100).toFixed(1)}%)`);
console.log('Pass Types:', typesCount);
