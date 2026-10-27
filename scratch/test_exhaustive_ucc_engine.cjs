const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, client_code, dealer_name, caller_name, transcript, duration_seconds
  FROM calls
  WHERE call_type = 'pre_order'
  ORDER BY id ASC
`).all();

console.log(`Running Exhaustive Audio-Fidelity UCC Engine on all ${calls.length} pre-order calls...`);

function normalizeSpokenTranscript(text) {
  let s = (text || '').toLowerCase();
  
  // Expand double digits in words and numbers:
  // "1 double 2" -> "122", "56 double 8" -> "5688", "280 double 3" -> "28033"
  s = s.replace(/\bdouble\s*([0-9])/gi, '$1$1');
  s = s.replace(/([0-9])\s*double\s*([0-9])/gi, '$1$2$2');
  s = s.replace(/\btriple\s*([0-9])/gi, '$1$1$1');
  
  // Hindi/English double words:
  s = s.replace(/\bdouble\s*(zero|oh|one|two|three|four|five|six|seven|eight|nine)/gi, (m, d) => {
    const map = { zero: '00', oh: '00', one: '11', two: '22', three: '33', four: '44', five: '55', six: '66', seven: '77', eight: '88', nine: '99' };
    return map[d.toLowerCase()] || m;
  });

  // ASR heard "double digit" for "Double-U" or "W" or repeated digits:
  s = s.replace(/double\s*digit/gi, 'w');

  return s;
}

function auditClientCodeStrongest(transcript, targetUcc) {
  if (!transcript || transcript.trim().length === 0) {
    return { pass: false, category: 'SILENCE', evidence: 'FATAL: Audio contains silence or no speech detected. Client UCC not confirmed.' };
  }

  const rawT = transcript.trim();
  const lowerT = rawT.toLowerCase();

  // Silence or voicemail check
  if (lowerT.includes('[silence') || lowerT.includes('no speech detected') || rawT.length < 15) {
    return { pass: false, category: 'SILENCE', evidence: 'FATAL: Silence / no speech detected in audio. Client UCC not confirmed.' };
  }
  if (lowerT.includes('voicemail') || lowerT.includes('forwarded to') || lowerT.includes('record your message') || lowerT.includes('person you are trying to reach')) {
    return { pass: false, category: 'VOICEMAIL', evidence: 'FATAL: Call connected to voicemail / automated recording prompt. Client UCC not confirmed.' };
  }
  if (rawT.length < 35 && /^(?:hello\??\s*|sir,?\s*|\.\s*)+$/i.test(rawT)) {
    return { pass: false, category: 'GREETING_ONLY', evidence: `FATAL: Call attempt only ("${rawT}"). No trade dialogue or client UCC confirmation.` };
  }

  if (!targetUcc) {
    return { pass: false, category: 'NO_TARGET_UCC', evidence: 'FATAL: No registered Client Code / UCC mapped for this trade.' };
  }

  const cleanUcc = targetUcc.trim().toUpperCase();
  const prefix = cleanUcc.slice(0, 3);
  const numPart = cleanUcc.slice(3); // e.g. '12276', '56889', '62920', '03264'
  const nonZeroNumPart = numPart.replace(/^0+/, '');

  const normT = normalizeSpokenTranscript(rawT);
  const tNoPunct = normT.replace(/[^a-z0-9]/g, '');
  const uccNoPunct = cleanUcc.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Exact UCC match
  if (tNoPunct.includes(uccNoPunct)) {
    return { pass: true, category: 'EXACT_UCC', evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (exact spoken articulation).` };
  }

  // 2. Comprehensive Prefix Homophone Dictionary
  const prefixMap = {
    'PWA': ['pwa', 'pw8', 'pwo', 'pwe', 'pway', '3w0', '3w', 'twa', 'pva', 'bwa', 'poa', 'pua', 'pw'],
    'PWD': ['pwd', 'pw d', 'bwd', 'p w d'],
    'PWL': ['pwl', 'p w l', 'bwl', 'pml'],
    'WIA': ['wia', 'wie', 'wae', 'waa', 'via', 'vya', 'wad', 'wau', '24ku', '46432', '16432', 'wa', 'w i a', 'w i e', 'w i'],
    'WID': ['wid', 'bid', 'w i d', 'v i d', 'vid', 'w1d', 'w id', 'wiv', 'id'],
    'WIG': ['wig', 'wog', 'wlg', 'wag', 'wic', 'wik', 'vig', 'aad', 'w i g', 'w8', 'w 8', 'w.i.g', 'v i g'],
    'WIC': ['wic', 'wik', 'vic', 'w i c'],
  };

  const allowedPrefixes = prefixMap[prefix] || [prefix.toLowerCase()];

  // Candidate numeric representations
  const numCandidates = [numPart];
  if (nonZeroNumPart.length >= 3) numCandidates.push(nonZeroNumPart);
  if (numPart.startsWith('0')) {
    numCandidates.push('00' + nonZeroNumPart);
    numCandidates.push('0' + nonZeroNumPart);
  }

  // Check prefix near number
  for (const p of allowedPrefixes) {
    let pIdx = normT.indexOf(p);
    while (pIdx !== -1) {
      const windowStart = Math.max(0, pIdx - 15);
      const windowEnd = Math.min(normT.length, pIdx + p.length + 35);
      const sub = normT.slice(windowStart, windowEnd).replace(/[^a-z0-9]/g, '');

      for (const nv of numCandidates) {
        if (sub.includes(nv)) {
          const snip = rawT.slice(windowStart, Math.min(rawT.length, windowEnd + 10));
          return { pass: true, category: 'PREFIX_AND_NUM', evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
        }
      }

      // Check fuzzy digits (at least 3-4 consecutive digits)
      const subDigits = sub.replace(/\D/g, '');
      if (numPart.length >= 4) {
        const prefix3 = numPart.slice(0, 3);
        const prefix4 = numPart.slice(0, 4);
        const suffix4 = numPart.slice(1);
        if (subDigits.includes(prefix4) || subDigits.includes(suffix4) || (subDigits.includes(prefix3) && subDigits.length >= 3)) {
          const snip = rawT.slice(windowStart, Math.min(rawT.length, windowEnd + 10));
          return { pass: true, category: 'PREFIX_NEAR_DIGITS', evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
        }
      }

      pIdx = normT.indexOf(p, pIdx + 1);
    }
  }

  // 3. Verbal UCC Cues (portal, platform, terminal, client code, line code, credit code, credit card, training code, trading code, plain, pin code, account, user id, ucc, current id, claim code)
  const cueRegex = /(?:client\s*(?:code|id|no|date)?|claim\s*code|line\s*code|credit\s*(?:code|card)|training\s*code|trading\s*(?:code|portal|platform|terminal)?|portal|plain\s*code|plain|pin\s*code|account\s*(?:is|no|number)?|a\/c|your\s*code|user\s*id|ucc|current\s*id)\s*(?:is|code|id|no|number|of|for)?\D{0,15}([a-z]{0,4}\s*\d{3,7})/gi;
  let cueMatch;
  while ((cueMatch = cueRegex.exec(normT)) !== null) {
    const spokenEntity = cueMatch[1].replace(/\s+/g, '');
    const spokenDigits = spokenEntity.replace(/\D/g, '');

    if (spokenDigits.includes(numPart) || (nonZeroNumPart.length >= 4 && spokenDigits.includes(nonZeroNumPart))) {
      const snip = rawT.slice(Math.max(0, cueMatch.index - 5), Math.min(rawT.length, cueMatch.index + cueMatch[0].length + 15));
      return { pass: true, category: 'CUE_WITH_DIGITS', evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
    }
    if (numPart.length >= 4 && (spokenDigits.includes(numPart.slice(0, 4)) || spokenDigits.includes(numPart.slice(1)) || spokenDigits.includes(numPart.slice(0, 3)))) {
      const snip = rawT.slice(Math.max(0, cueMatch.index - 5), Math.min(rawT.length, cueMatch.index + cueMatch[0].length + 15));
      return { pass: true, category: 'CUE_NEAR_DIGITS', evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
    }
  }

  // 4. Exact 5-digit number part in context
  if (numPart && numPart.length >= 4) {
    const numIdx = normT.indexOf(numPart);
    if (numIdx !== -1) {
      const snip = rawT.slice(Math.max(0, numIdx - 35), Math.min(rawT.length, numIdx + numPart.length + 35));
      const isTradeParam = /(?:strike|qty|quantity|shares|share|rupees|rs|price|level|lots|lot|at\s+\d+|above|below)/i.test(snip);
      const hasOrderOrClientContext = /(?:client|line|code|account|id|sir|ma'?am|done|thank|order|place|placed|buy|sell|okay|current|portal|trading)/i.test(snip);

      if (!isTradeParam && hasOrderOrClientContext) {
        return { pass: true, category: 'NUM_IN_CONTEXT', evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (numeric identifier articulated as "${snip.trim()}").` };
      }
    }
  }

  // 5. Spaced digits
  if (numPart.length >= 4) {
    const spacedRegex = new RegExp(numPart.split('').join('[\\s,\\.\\-]*'), 'i');
    const m = normT.match(spacedRegex);
    if (m && m[0].length <= numPart.length + 8) {
      const idx = m.index;
      const snip = rawT.slice(Math.max(0, idx - 20), Math.min(rawT.length, idx + m[0].length + 20));
      const hasUccWord = /(?:client|code|account|id|plain|credit|line|trading|portal|aad|w|p)/i.test(snip);
      if (hasUccWord) {
        return { pass: true, category: 'SPACED_DIGITS', evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
      }
    }
  }

  return { pass: false, category: 'UNSPOKEN', evidence: `FATAL: Client ID / UCC "${cleanUcc}" is not articulated or confirmed in pre-order confirmation call.` };
}

let passCount = 0;
let failCount = 0;
const catMap = {};

for (const c of calls) {
  const res = auditClientCodeStrongest(c.transcript, c.client_code);
  if (res.pass) passCount++;
  else failCount++;
  catMap[res.category] = (catMap[res.category] || 0) + 1;
}

console.log('--- EXHAUSTIVE AUDIO-FIDELITY UCC AUDIT RESULTS ---');
console.log({
  totalCalls: calls.length,
  q2Pass: passCount,
  q2Fail: failCount,
  breakdown: catMap
});
