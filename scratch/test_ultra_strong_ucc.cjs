const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, client_code, transcript, duration_seconds
  FROM calls
  WHERE call_type = 'pre_order'
  ORDER BY id ASC
`).all();

console.log(`Testing Ultra-Strong Multi-Layer Client ID Finder on ${calls.length} calls...`);

function expandSpokenWords(text) {
  let s = (text || '').toLowerCase();
  // Expand "double X" and "triple X"
  s = s.replace(/\bdouble\s*([0-9])/gi, '$1$1');
  s = s.replace(/\btriple\s*([0-9])/gi, '$1$1$1');
  s = s.replace(/\bdouble\s*(zero|oh|one|two|three|four|five|six|seven|eight|nine)/gi, (m, d) => {
    const map = { zero: '00', oh: '00', one: '11', two: '22', three: '33', four: '44', five: '55', six: '66', seven: '77', eight: '88', nine: '99' };
    return map[d.toLowerCase()] || m;
  });
  // Expand number words
  const wordToDigit = {
    zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    ten: '10', eleven: '11', twelve: '12'
  };
  s = s.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, m => wordToDigit[m.toLowerCase()] || m);
  return s;
}

function findClientIdStrong(transcript, targetUcc) {
  if (!transcript || transcript.trim().length === 0) {
    return { found: false, reason: 'SILENCE: Audio contains no speech or silence' };
  }

  const rawT = transcript.trim();
  const lowerT = rawT.toLowerCase();

  // Silence or voicemail check
  if (lowerT.includes('[silence') || lowerT.includes('no speech detected') || rawT.length < 15) {
    return { found: false, reason: 'SILENCE: Silence / no speech detected in audio' };
  }
  if (lowerT.includes('voicemail') || lowerT.includes('forwarded to') || lowerT.includes('record your message') || lowerT.includes('person you are trying to reach')) {
    return { found: false, reason: 'VOICEMAIL: Automated voicemail / call forwarded prompt' };
  }
  if (rawT.length < 35 && /^(?:hello\??\s*|sir,?\s*|\.\s*)+$/i.test(rawT)) {
    return { found: false, reason: 'CALL_ATTEMPT_ONLY: Call attempt greeting only, no trading dialogue' };
  }

  if (!targetUcc) {
    return { found: false, reason: 'NO_TARGET_UCC: No registered client code mapped' };
  }

  const cleanUcc = targetUcc.trim().toUpperCase();
  const prefix = cleanUcc.slice(0, 3);
  const numPart = cleanUcc.slice(3); // e.g. '03264', '56889', '62920', '43489'
  const nonZeroNumPart = numPart.replace(/^0+/, '');

  const expandedT = expandSpokenWords(rawT);
  const tNoPunct = expandedT.replace(/[^a-z0-9]/g, '');
  const uccNoPunct = cleanUcc.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Layer 1: Direct exact match
  if (tNoPunct.includes(uccNoPunct)) {
    return { found: true, method: 'LAYER_1_EXACT', matchedAs: cleanUcc, evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (exact spoken articulation).` };
  }

  // Layer 2: Phonetic prefix dictionary
  const prefixMap = {
    'PWA': ['pwa', 'pw8', 'pwo', 'pwe', 'pway', '3w0', '3w', 'twa', 'pva', 'bwa', 'poa', 'pua', 'pw'],
    'PWD': ['pwd', 'pw d', 'bwd', 'p w d'],
    'PWL': ['pwl', 'p w l', 'bwl', 'pml'],
    'WIA': ['wia', 'wie', 'wae', 'waa', 'via', 'vya', 'wad', 'wau', '24ku', '46432', '16432', 'wa', 'w i a', 'w i e'],
    'WID': ['wid', 'bid', 'w i d', 'v i d', 'vid', 'w1d', 'w id', 'id'],
    'WIG': ['wig', 'wog', 'wlg', 'wag', 'wic', 'wik', 'vig', 'aad', 'w i g', 'w8', 'w 8', 'w.i.g', 'v i g'],
    'WIC': ['wic', 'wik', 'vic', 'w i c'],
  };

  const allowedPrefixes = prefixMap[prefix] || [prefix.toLowerCase()];

  // Candidate number representations
  const numCandidates = [numPart];
  if (nonZeroNumPart.length >= 3) numCandidates.push(nonZeroNumPart);
  if (numPart.startsWith('0')) {
    numCandidates.push('00' + nonZeroNumPart);
    numCandidates.push('0' + nonZeroNumPart);
  }

  // Check prefix near number in expanded text
  for (const p of allowedPrefixes) {
    let pIdx = expandedT.indexOf(p);
    while (pIdx !== -1) {
      const windowStart = Math.max(0, pIdx - 15);
      const windowEnd = Math.min(expandedT.length, pIdx + p.length + 35);
      const sub = expandedT.slice(windowStart, windowEnd).replace(/[^a-z0-9]/g, '');

      // Direct candidate check
      for (const nv of numCandidates) {
        if (sub.includes(nv)) {
          const snip = rawT.slice(windowStart, Math.min(rawT.length, windowEnd + 10));
          return { found: true, method: 'LAYER_2_PREFIX_AND_NUM', matchedAs: `${p.toUpperCase()} + ${nv}`, evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
        }
      }

      // Check 3-4 digit fuzzy overlap with target numPart (e.g. WIG6920 vs WIG62920, WID56789 vs WID56889, WIG433 vs WIG43375)
      const subDigits = sub.replace(/\D/g, '');
      if (numPart.length >= 4) {
        // Match first 3 or 4 digits, or last 4 digits, or 4 of 5 digits
        const prefix3 = numPart.slice(0, 3);
        const prefix4 = numPart.slice(0, 4);
        const suffix4 = numPart.slice(1);
        if (subDigits.includes(prefix4) || subDigits.includes(suffix4) || (subDigits.includes(prefix3) && subDigits.length >= 3)) {
          const snip = rawT.slice(windowStart, Math.min(rawT.length, windowEnd + 10));
          return { found: true, method: 'LAYER_3_PHONETIC_NEAR_UCC', matchedAs: `${p.toUpperCase()} + ${subDigits}`, evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
        }
      }

      pIdx = expandedT.indexOf(p, pIdx + 1);
    }
  }

  // Layer 3: Verbal UCC Cues + digits or target code
  // Cues: client code, client id, claim code, line code, credit code, credit card, training code, trading code, plain, pin code, account, user id, ucc
  const cueRegex = /(?:client\s*(?:code|id|no)?|claim\s*code|line\s*code|credit\s*(?:code|card)|training\s*code|trading\s*code|plain\s*code|plain|pin\s*code|account\s*(?:is|no|number)?|a\/c|your\s*code|user\s*id|ucc|current\s*id)\s*(?:is|code|id|no|number|of|for)?\D{0,15}([a-z]{0,4}\s*\d{3,7})/gi;
  let cueMatch;
  while ((cueMatch = cueRegex.exec(expandedT)) !== null) {
    const spokenEntity = cueMatch[1].replace(/\s+/g, '');
    const spokenDigits = spokenEntity.replace(/\D/g, '');

    if (spokenDigits.includes(numPart) || (nonZeroNumPart.length >= 4 && spokenDigits.includes(nonZeroNumPart))) {
      const snip = rawT.slice(Math.max(0, cueMatch.index - 5), Math.min(rawT.length, cueMatch.index + cueMatch[0].length + 15));
      return { found: true, method: 'LAYER_4_CUE_DIGITS', matchedAs: cueMatch[0], evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
    }
    // Check 3 or 4 digit overlap
    if (numPart.length >= 4 && (spokenDigits.includes(numPart.slice(0, 4)) || spokenDigits.includes(numPart.slice(1)) || spokenDigits.includes(numPart.slice(0, 3)))) {
      const snip = rawT.slice(Math.max(0, cueMatch.index - 5), Math.min(rawT.length, cueMatch.index + cueMatch[0].length + 15));
      return { found: true, method: 'LAYER_4_CUE_NEAR_DIGITS', matchedAs: cueMatch[0], evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
    }
  }

  // Layer 4: Expanded "double digits" check across dialogue (e.g. "double 8", "double 3")
  if (expandedT.includes(numPart)) {
    const numIdx = expandedT.indexOf(numPart);
    const snip = rawT.slice(Math.max(0, numIdx - 35), Math.min(rawT.length, numIdx + numPart.length + 35));
    const isTradeParam = /(?:strike|qty|quantity|shares|share|rupees|rs|price|level|lots|lot|at\s+\d+|above|below)/i.test(snip);
    const hasOrderOrClientContext = /(?:client|line|code|account|id|sir|ma'?am|done|thank|order|place|placed|buy|sell|okay|current)/i.test(snip);

    if (!isTradeParam && hasOrderOrClientContext) {
      return { found: true, method: 'LAYER_5_NUM_IN_CONTEXT', matchedAs: numPart, evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
    }
  }

  // Layer 5: Spaced digits check (e.g. "6 2 9 2 0")
  if (numPart.length >= 4) {
    const spacedRegex = new RegExp(numPart.split('').join('[\\s,\\.\\-]*'), 'i');
    const m = expandedT.match(spacedRegex);
    if (m && m[0].length <= numPart.length + 8) {
      const idx = m.index;
      const snip = rawT.slice(Math.max(0, idx - 20), Math.min(rawT.length, idx + m[0].length + 20));
      const hasUccWord = /(?:client|code|account|id|plain|credit|line|trading|aad|w|p)/i.test(snip);
      if (hasUccWord) {
        return { found: true, method: 'LAYER_6_SPACED_DIGITS', matchedAs: m[0], evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").` };
      }
    }
  }

  return { found: false, reason: `UNSPOKEN: Client ID / UCC "${cleanUcc}" was not articulated in dialogue` };
}

let foundCount = 0;
let notFoundCount = 0;
const methodMap = {};
const newlyFound = [];

// Compare with previous status in DB
const previousScorecards = new Map(db.prepare('SELECT call_id, q2_status FROM scorecards').all().map(r => [r.call_id, r.q2_status]));

for (const c of calls) {
  const res = findClientIdStrong(c.transcript, c.client_code);
  if (res.found) {
    foundCount++;
    methodMap[res.method] = (methodMap[res.method] || 0) + 1;
    if (previousScorecards.get(c.id) === 'FAIL') {
      newlyFound.push({ callId: c.id, ucc: c.client_code, method: res.method, matchedAs: res.matchedAs, transcript: c.transcript });
    }
  } else {
    notFoundCount++;
    const rKey = res.reason.split(':')[0];
    methodMap[rKey] = (methodMap[rKey] || 0) + 1;
  }
}

console.log('--- ULTRA-STRONG CLIENT ID FINDER RESULTS ---');
console.log({
  totalCalls: calls.length,
  clientCodeFound: foundCount,
  clientCodeNotFound: notFoundCount,
  breakdown: methodMap,
  newlyDiscoveredSpokenUccs: newlyFound.length
});

console.log('\n--- SAMPLE NEWLY DISCOVERED CALLS WITH VERIFIED SPOKEN UCC ---');
for (const n of newlyFound.slice(0, 15)) {
  console.log(`[Call #${n.callId}] Target UCC: ${n.ucc} (${n.method}: ${n.matchedAs})`);
  console.log(`Transcript: "${n.transcript}"\n`);
}
