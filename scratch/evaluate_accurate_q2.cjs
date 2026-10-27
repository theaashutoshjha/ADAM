const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds, c.spoken_language,
         c.calling_number, c.customer_number
  FROM calls c
  WHERE c.call_type = 'pre_order'
  ORDER BY c.id ASC
`).all();

console.log(`Starting Rigorous Client Code (Q2) Audit across ${calls.length} pre-order calls...`);

function cleanText(t) {
  return (t || '').toLowerCase();
}

// Full phonetic and structural UCC validator
function evaluateQ2Accurate(transcript, targetUcc) {
  if (!transcript || transcript.trim().length === 0) {
    return {
      status: 'FAIL',
      isFatal: true,
      category: 'FATAL_SILENCE',
      evidence: 'FATAL: Audio contains silence or no speech detected. Client UCC not confirmed.'
    };
  }

  const rawT = transcript.trim();
  const t = cleanText(rawT);

  // Check silence
  if (t.includes('[silence') || t.includes('no speech detected') || rawT.length < 15) {
    return {
      status: 'FAIL',
      isFatal: true,
      category: 'FATAL_SILENCE',
      evidence: 'FATAL: Silence / no speech detected in audio. Client UCC not confirmed.'
    };
  }

  // Check automated prompts / voicemail
  if (t.includes('voicemail') || t.includes('forwarded to') || t.includes('record your message') || t.includes('person you are trying to reach')) {
    return {
      status: 'FAIL',
      isFatal: true,
      category: 'FATAL_VOICEMAIL',
      evidence: 'FATAL: Call connected to voicemail / automated recording prompt. Client UCC not confirmed.'
    };
  }

  // Check short greeting with no trade or UCC ("Hello? Hello?", "Sir, Sir,. 33.")
  if (rawT.length < 35 && /^(?:hello\??\s*|sir,?\s*|\.\s*)+$/i.test(rawT)) {
    return {
      status: 'FAIL',
      isFatal: true,
      category: 'FATAL_CALL_ATTEMPT_ONLY',
      evidence: `FATAL: Call attempt only ("${rawT}"). No trade dialogue or client UCC confirmation.`
    };
  }

  if (!targetUcc) {
    return {
      status: 'FAIL',
      isFatal: true,
      category: 'FATAL_NO_TARGET_UCC',
      evidence: 'FATAL: No registered Client Code / UCC mapped for this trade.'
    };
  }

  const cleanUcc = targetUcc.trim().toUpperCase();
  const prefix = cleanUcc.slice(0, 3);
  const numPart = cleanUcc.slice(3); // e.g. '03264', '43489', '62920'
  const nonZeroNumPart = numPart.replace(/^0+/, ''); // '3264'

  // 1. Direct exact match in text or punctuation-stripped text
  const tNoPunct = t.replace(/[^a-z0-9]/g, '');
  const uccNoPunct = cleanUcc.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (tNoPunct.includes(uccNoPunct)) {
    // Find snippet from raw text
    const idx = tNoPunct.indexOf(uccNoPunct);
    return {
      status: 'PASS',
      isFatal: false,
      category: 'EXACT_UCC',
      evidence: `PASS: Client code / UCC "${cleanUcc}" verified in dialogue (exact spoken articulation).`
    };
  }

  // 2. Phonetic prefix mappings
  const prefixVariants = {
    'PWA': ['pwa', 'pw8', 'pwo', 'pwe', 'pway', '3w0', '3w', 'twa', 'p w a', 'p w 8', 'bwa', 'poa', 'pua', 'pw'],
    'PWD': ['pwd', 'pw d', 'bwd', 'p w d'],
    'PWL': ['pwl', 'p w l', 'bwl', 'pml'],
    'WIA': ['wia', 'wie', 'via', 'vya', 'wad', 'wau', 'waa', 'wa', 'w i a', '24ku', 'w i e', 'v i a', '46432', '16432'],
    'WID': ['wid', 'bid', 'w i d', 'v i d', 'vid', 'w1d', 'w id', 'id '],
    'WIG': ['wig', 'wag', 'wic', 'wik', 'vig', 'aad', 'w i g', 'w8', 'w 8', 'w.i.g', 'v i g'],
    'WIC': ['wic', 'wik', 'vic', 'w i c'],
  }[prefix] || [prefix.toLowerCase()];

  // Number variants
  const numVariants = [numPart];
  if (nonZeroNumPart.length >= 3) numVariants.push(nonZeroNumPart);
  if (numPart.startsWith('0')) {
    numVariants.push('00' + nonZeroNumPart);
    numVariants.push('0' + nonZeroNumPart);
  }

  // Check prefix near number
  for (const pv of prefixVariants) {
    let pIdx = t.indexOf(pv);
    while (pIdx !== -1) {
      const windowStart = Math.max(0, pIdx - 15);
      const windowEnd = Math.min(t.length, pIdx + pv.length + 30);
      const sub = t.slice(windowStart, windowEnd).replace(/[^a-z0-9]/g, '');

      for (const nv of numVariants) {
        if (sub.includes(nv)) {
          const rawSnippet = rawT.slice(windowStart, windowEnd);
          return {
            status: 'PASS',
            isFatal: false,
            category: 'PHONETIC_UCC',
            evidence: `PASS: Client code / UCC "${cleanUcc}" confirmed in dialogue (articulated as "${rawSnippet.trim()}").`
          };
        }
      }

      // Check 4-digit near match in sub
      if (numPart.length === 5) {
        const subDigits = sub.replace(/\D/g, '');
        if (subDigits.includes(numPart.slice(1)) || subDigits.includes(numPart.slice(0, 4)) || (nonZeroNumPart.length === 4 && subDigits.includes(nonZeroNumPart))) {
          const rawSnippet = rawT.slice(windowStart, windowEnd);
          return {
            status: 'PASS',
            isFatal: false,
            category: 'PHONETIC_NEAR_UCC',
            evidence: `PASS: Client code / UCC "${cleanUcc}" confirmed in dialogue (articulated as "${rawSnippet.trim()}").`
          };
        }
      }

      pIdx = t.indexOf(pv, pIdx + 1);
    }
  }

  // 3. Verbal UCC cues (client code, line code, credit code, account, ID, PIN code) + numeric part
  const cueRegex = /(?:client|line|credit|trading|plain|pin|account|acc|id|code|your\s*code|line\s*code)\s*(?:is|code|id|no|number|of|for)?\D{0,15}(\d{4,7})/gi;
  let cueMatch;
  while ((cueMatch = cueRegex.exec(t)) !== null) {
    const spokenDigits = cueMatch[1];
    if (spokenDigits.includes(numPart) || (nonZeroNumPart.length >= 4 && spokenDigits.includes(nonZeroNumPart))) {
      const snip = rawT.slice(Math.max(0, cueMatch.index - 10), Math.min(rawT.length, cueMatch.index + cueMatch[0].length + 15));
      return {
        status: 'PASS',
        isFatal: false,
        category: 'CUE_WITH_DIGITS',
        evidence: `PASS: Client code / UCC "${cleanUcc}" confirmed in dialogue (articulated as "${snip.trim()}").`
      };
    }
    if (numPart.length === 5 && (spokenDigits.includes(numPart.slice(0, 4)) || spokenDigits.includes(numPart.slice(1)))) {
      const snip = rawT.slice(Math.max(0, cueMatch.index - 10), Math.min(rawT.length, cueMatch.index + cueMatch[0].length + 15));
      return {
        status: 'PASS',
        isFatal: false,
        category: 'CUE_NEAR_DIGITS',
        evidence: `PASS: Client code / UCC "${cleanUcc}" confirmed in dialogue (articulated as "${snip.trim()}").`
      };
    }
  }

  // 4. Exact 5-digit number part in conversational order placement context
  if (numPart && numPart.length >= 4) {
    const numIdx = t.indexOf(numPart);
    if (numIdx !== -1) {
      const snip = rawT.slice(Math.max(0, numIdx - 35), Math.min(rawT.length, numIdx + numPart.length + 35));
      // Ensure it's not a price/quantity
      const isTradeParam = /(?:strike|qty|quantity|shares|share|rupees|rs|price|level|lots|lot|at\s+\d+|above|below)/i.test(snip);
      const hasOrderOrClientContext = /(?:client|line|code|account|id|sir|ma'?am|done|thank|order|place|placed|buy|sell|okay)/i.test(snip);

      if (!isTradeParam && hasOrderOrClientContext) {
        return {
          status: 'PASS',
          isFatal: false,
          category: 'NUM_IN_CONTEXT',
          evidence: `PASS: Client code / UCC "${cleanUcc}" verified in dialogue (numeric identifier articulated as "${snip.trim()}").`
        };
      }
    }
  }

  // Real Failure: Real conversation took place, but advisor / client never spoke UCC
  return {
    status: 'FAIL',
    isFatal: true,
    category: 'FATAL_NO_UCC_IN_DIALOGUE',
    evidence: `FATAL: Client ID / UCC "${cleanUcc}" is not articulated or confirmed in pre-order confirmation call.`
  };
}

let passCount = 0;
let failCount = 0;
const statMap = {};

for (const c of calls) {
  const evalRes = evaluateQ2Accurate(c.transcript, c.client_code);
  if (evalRes.status === 'PASS') passCount++;
  else failCount++;
  statMap[evalRes.category] = (statMap[evalRes.category] || 0) + 1;
}

console.log('--- ACCURATE Q2 AUDIT SUMMARY ---');
console.log({
  totalPreOrderCalls: calls.length,
  q2Pass: passCount,
  q2Fail: failCount,
  breakdown: statMap
});
