const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, client_code, transcript, spoken_language, duration_seconds
  FROM calls
  WHERE call_type = 'pre_order'
  ORDER BY id ASC
`).all();

console.log(`Auditing all ${calls.length} pre-order calls for Client Code articulation...`);

// Let's create an exhaustive phonetic and fuzzy matcher for Indian stockbroking UCCs
// Target UCCs typically:
// Prefix: 3 letters (PWA, PWD, PWL, WIA, WID, WIG, WIC, etc.)
// Number: 5 digits (e.g. 03264, 43489, 56889, 62920, etc.)

function cleanText(t) {
  return (t || '').toLowerCase();
}

function auditClientCodeArticulation(transcript, targetUcc) {
  if (!transcript || transcript.trim().length === 0) {
    return { spoken: false, reason: 'SILENCE: Audio contains no speech or silence' };
  }

  const rawT = transcript;
  const t = cleanText(transcript);

  // Check silence or voicemail
  if (t.includes('[silence') || t.includes('no speech detected') || t.length < 15) {
    return { spoken: false, reason: 'SILENCE: Audio contains silence / no speech detected' };
  }
  if (t.includes('voicemail') || t.includes('forwarded to') || t.includes('record your message') || t.includes('person you are trying to reach')) {
    return { spoken: false, reason: 'VOICEMAIL: Automated voicemail / call forwarded prompt' };
  }

  if (!targetUcc) {
    return { spoken: false, reason: 'NO_TARGET_UCC: No client code linked to trade' };
  }

  const cleanUcc = targetUcc.trim().toUpperCase();
  const prefix = cleanUcc.slice(0, 3);
  const numPart = cleanUcc.slice(3); // e.g. '03264' or '43489' or '62920'
  const nonZeroNumPart = numPart.replace(/^0+/, ''); // '3264'

  // 1. Direct exact or punctuation-free match
  const tNoPunct = t.replace(/[^a-z0-9]/g, '');
  const uccNoPunct = cleanUcc.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (tNoPunct.includes(uccNoPunct)) {
    return { spoken: true, confidence: 1.0, type: 'EXACT', matchedAs: cleanUcc };
  }

  // 2. Check prefix variations + numeric variations
  // What does ASR transcribe for prefixes?
  const prefixMap = {
    'PWA': ['pwa', 'pw8', 'pwo', 'pway', '3w0', '3w', 'twa', 'p w a', 'p w 8', 'bwa', 'poa', 'pua'],
    'PWD': ['pwd', 'pw d', 'bwd', 'p w d'],
    'PWL': ['pwl', 'p w l', 'bwl', 'pml'],
    'WIA': ['wia', 'wie', 'via', 'vya', 'wad', 'wau', 'waa', 'wa', 'w i a', '24ku', 'w i e', 'v i a', '46432', '16432'],
    'WID': ['wid', 'bid', 'w i d', 'v i d', 'vid', 'w1d', 'w id', 'id '],
    'WIG': ['wig', 'wag', 'wic', 'wik', 'vig', 'aad', 'w i g', 'w8', 'w 8', 'w.i.g', 'v i g'],
    'WIC': ['wic', 'wik', 'vic', 'w i c'],
  };

  const allowedPrefixes = prefixMap[prefix] || [prefix.toLowerCase()];

  // Number part variations in ASR:
  // e.g. numPart = '03264'
  // Could be: '03264', '3264', '033264', '0 3 2 6 4', 'zero three two six four'
  // Or numPart = '56889' -> '56889', '56789', '5 6 double 8 9', '568894'
  // Or numPart = '62920' -> '62920', '6920', '6 920', '6 9 2 0', '6292'
  // Or numPart = '02825' -> '02825', '2825', '002825', '028825'
  // Or numPart = '03660' -> '03660', '3660', '0366', '366'
  // Or numPart = '04415' -> '04415', '4415', '0441'

  // Generate candidate number patterns
  const numCandidates = [numPart];
  if (nonZeroNumPart.length >= 3) numCandidates.push(nonZeroNumPart);
  if (numPart.startsWith('0')) {
    numCandidates.push('00' + nonZeroNumPart);
    numCandidates.push('0' + nonZeroNumPart);
  }

  // Check if any prefix appears near any number candidate (within 30 characters)
  for (const p of allowedPrefixes) {
    const pIdx = t.indexOf(p);
    if (pIdx !== -1) {
      // Look within window around prefix
      const windowStart = Math.max(0, pIdx - 15);
      const windowEnd = Math.min(t.length, pIdx + p.length + 30);
      const sub = t.slice(windowStart, windowEnd).replace(/[^a-z0-9]/g, '');

      for (const num of numCandidates) {
        if (sub.includes(num)) {
          return { spoken: true, confidence: 0.95, type: 'PREFIX_AND_NUM', matchedAs: `${p.toUpperCase()} + ${num}` };
        }
      }

      // Check fuzzy digit match in sub (at least 4 matching consecutive digits or 4 out of 5 digits)
      if (numPart.length === 5) {
        const subDigits = sub.replace(/\D/g, '');
        // Check if 4 consecutive digits match (e.g. 6920 vs 62920, 56789 vs 56889, 028825 vs 02825)
        if (subDigits.includes(numPart.slice(1)) || subDigits.includes(numPart.slice(0, 4)) || (nonZeroNumPart.length === 4 && subDigits.includes(nonZeroNumPart))) {
          return { spoken: true, confidence: 0.90, type: 'PHONETIC_NEAR_MATCH', matchedAs: `${p.toUpperCase()} + ${subDigits}` };
        }
      }
    }
  }

  // 3. Explicit verbal cues: "client code", "client id", "trading code", "credit code", "line code", "account"
  // followed by numbers
  const cueRegex = /(?:client|line|credit|trading|plain|pin|account|acc|id|code|your\s*code|line\s*code)\s*(?:is|code|id|no|number|of|for)?\D{0,15}(\d{4,7})/gi;
  let cueMatch;
  while ((cueMatch = cueRegex.exec(t)) !== null) {
    const spokenDigits = cueMatch[1];
    if (spokenDigits.includes(numPart) || (nonZeroNumPart.length >= 4 && spokenDigits.includes(nonZeroNumPart))) {
      return { spoken: true, confidence: 0.95, type: 'CUE_WITH_DIGITS', matchedAs: `Cue + ${spokenDigits}` };
    }
    // Check 4-digit fuzzy overlap with target numPart
    if (numPart.length === 5 && (spokenDigits.includes(numPart.slice(0, 4)) || spokenDigits.includes(numPart.slice(1)))) {
      return { spoken: true, confidence: 0.85, type: 'CUE_NEAR_DIGITS', matchedAs: `Cue + ${spokenDigits}` };
    }
  }

  // 4. Exact 5-digit number part surrounded by word boundaries or spaces
  if (numPart && numPart.length >= 4) {
    // Check if preceded by a known client word anywhere in sentence
    const hasClientContext = /\b(?:client|line|credit|trading|account|code|sir|ma'?am|done|thank|order|place|placed|buy|sell)\b/i.test(t);
    const numIdx = t.indexOf(numPart);
    if (numIdx !== -1 && hasClientContext) {
      // Extract surrounding context
      const snippet = t.slice(Math.max(0, numIdx - 20), Math.min(t.length, numIdx + numPart.length + 20));
      return { spoken: true, confidence: 0.85, type: 'NUMBER_IN_CONTEXT', matchedAs: numPart, snippet };
    }
  }

  return { spoken: false, reason: `UNSPOKEN: Client ID / UCC "${cleanUcc}" was not articulated in dialogue` };
}

let spokenCount = 0;
let unspokenCount = 0;
const categorized = {
  EXACT: 0,
  PREFIX_AND_NUM: 0,
  PHONETIC_NEAR_MATCH: 0,
  CUE_WITH_DIGITS: 0,
  CUE_NEAR_DIGITS: 0,
  NUMBER_IN_CONTEXT: 0,
  SILENCE: 0,
  VOICEMAIL: 0,
  UNSPOKEN: 0
};

const results = [];
for (const c of calls) {
  const res = auditClientCodeArticulation(c.transcript, c.client_code);
  results.push({ callId: c.id, ucc: c.client_code, res, transcript: c.transcript });
  if (res.spoken) {
    spokenCount++;
    categorized[res.type] = (categorized[res.type] || 0) + 1;
  } else {
    unspokenCount++;
    const rKey = res.reason.split(':')[0];
    categorized[rKey] = (categorized[rKey] || 0) + 1;
  }
}

console.log({
  totalCalls: calls.length,
  clientCodeSpoken: spokenCount,
  clientCodeNotSpoken: unspokenCount,
  breakdown: categorized
});
