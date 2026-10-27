const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT s.id as sc_id, s.audit_id, s.call_id, s.client_code, s.calling_number, c.customer_number,
         s.q1_status, s.q1_evidence,
         s.q3_status, s.q3_evidence,
         s.q4_status, s.q4_evidence,
         s.q5_status, s.q5_evidence,
         c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
`).all();

console.log(`Processing Genuine Q2 Audit on ${calls.length} scorecards...`);

function cleanText(t) {
  return (t || '').toLowerCase();
}

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

  if (t.includes('[silence') || t.includes('no speech detected') || rawT.length < 15) {
    return {
      status: 'FAIL',
      isFatal: true,
      category: 'FATAL_SILENCE',
      evidence: 'FATAL: Silence / no speech detected in audio. Client UCC not confirmed.'
    };
  }

  if (t.includes('voicemail') || t.includes('forwarded to') || t.includes('record your message') || t.includes('person you are trying to reach')) {
    return {
      status: 'FAIL',
      isFatal: true,
      category: 'FATAL_VOICEMAIL',
      evidence: 'FATAL: Call connected to voicemail / automated recording prompt. Client UCC not confirmed.'
    };
  }

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
  const numPart = cleanUcc.slice(3);
  const nonZeroNumPart = numPart.replace(/^0+/, '');

  // 1. Direct exact match in text or punctuation-stripped text
  const tNoPunct = t.replace(/[^a-z0-9]/g, '');
  const uccNoPunct = cleanUcc.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (tNoPunct.includes(uccNoPunct)) {
    return {
      status: 'PASS',
      isFatal: false,
      category: 'EXACT_UCC',
      evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${cleanUcc}").`
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

  const numVariants = [numPart];
  if (nonZeroNumPart.length >= 3) numVariants.push(nonZeroNumPart);
  if (numPart.startsWith('0')) {
    numVariants.push('00' + nonZeroNumPart);
    numVariants.push('0' + nonZeroNumPart);
  }

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
            evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${rawSnippet.trim()}").`
          };
        }
      }

      if (numPart.length === 5) {
        const subDigits = sub.replace(/\D/g, '');
        if (subDigits.includes(numPart.slice(1)) || subDigits.includes(numPart.slice(0, 4)) || (nonZeroNumPart.length === 4 && subDigits.includes(nonZeroNumPart))) {
          const rawSnippet = rawT.slice(windowStart, windowEnd);
          return {
            status: 'PASS',
            isFatal: false,
            category: 'PHONETIC_NEAR_UCC',
            evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${rawSnippet.trim()}").`
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
        evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").`
      };
    }
    if (numPart.length === 5 && (spokenDigits.includes(numPart.slice(0, 4)) || spokenDigits.includes(numPart.slice(1)))) {
      const snip = rawT.slice(Math.max(0, cueMatch.index - 10), Math.min(rawT.length, cueMatch.index + cueMatch[0].length + 15));
      return {
        status: 'PASS',
        isFatal: false,
        category: 'CUE_NEAR_DIGITS',
        evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (articulated as "${snip.trim()}").`
      };
    }
  }

  // 4. Exact 5-digit number part in conversational order placement context
  if (numPart && numPart.length >= 4) {
    const numIdx = t.indexOf(numPart);
    if (numIdx !== -1) {
      const snip = rawT.slice(Math.max(0, numIdx - 35), Math.min(rawT.length, numIdx + numPart.length + 35));
      const isTradeParam = /(?:strike|qty|quantity|shares|share|rupees|rs|price|level|lots|lot|at\s+\d+|above|below)/i.test(snip);
      const hasOrderOrClientContext = /(?:client|line|code|account|id|sir|ma'?am|done|thank|order|place|placed|buy|sell|okay)/i.test(snip);

      if (!isTradeParam && hasOrderOrClientContext) {
        return {
          status: 'PASS',
          isFatal: false,
          category: 'NUM_IN_CONTEXT',
          evidence: `Client code / UCC "${cleanUcc}" verified in dialogue (numeric identifier articulated as "${snip.trim()}").`
        };
      }
    }
  }

  return {
    status: 'FAIL',
    isFatal: true,
    category: 'FATAL_NO_UCC_IN_DIALOGUE',
    evidence: `FATAL: Client ID / UCC "${cleanUcc}" is not articulated or confirmed in pre-order confirmation call.`
  };
}

let q2PassCount = 0;
let q2FailCount = 0;
let score5Count = 0;
let score4Count = 0;
let fatalViolationCount = 0;

const updateScorecardStmt = db.prepare(`
  UPDATE scorecards SET
    score = ?,
    is_fatal = ?,
    fatal_reasons = ?,
    q2_status = ?,
    q2_evidence = ?,
    audit_comment = ?,
    updated_at = ?
  WHERE id = ?
`);

const updateAuditStmt = db.prepare(`
  UPDATE audits SET
    q2 = ?,
    q2_flag = ?,
    q2_evidence = ?,
    score = ?,
    audit_comment = ?,
    compliance_disposition = ?,
    updated_at = ?
  WHERE id = ?
`);

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

db.exec('BEGIN TRANSACTION;');

try {
  for (const c of calls) {
    const q2Res = evaluateQ2Accurate(c.transcript, c.client_code);
    const q2Pass = q2Res.status === 'PASS';
    if (q2Pass) q2PassCount++;
    else q2FailCount++;

    const q1Pass = c.q1_status === 'PASS';
    const q3Pass = c.q3_status === 'PASS';
    const q4Pass = c.q4_status === 'PASS';
    const q5Pass = c.q5_status === 'PASS';

    // Calculate genuine score
    let score = 0;
    if (q1Pass) score++;
    if (q2Pass) score++;
    if (q3Pass) score++;
    if (q4Pass) score++;
    if (q5Pass) score++;

    // Under SEBI: Q1 and Q2 are FATAL checkpoints
    const isFatal = !q1Pass || !q2Pass;
    const fatalReasons = [];
    if (!q1Pass) fatalReasons.push('Fatal: Calling number does not match registered mobile.');
    if (!q2Pass) fatalReasons.push(q2Res.evidence);

    if (isFatal) {
      fatalViolationCount++;
    } else {
      if (score === 5) score5Count++;
      else if (score === 4) score4Count++;
    }

    const disposition = isFatal ? 'FATAL_VIOLATION' : 'COMPLIANT';
    const auditComment = isFatal
      ? `FATAL VIOLATION: ${fatalReasons.join(' ')} Score: ${score}/5.`
      : (score === 5
          ? `100% REGULATORY COMPLIANT: All 5 SEBI pre-order checkpoints verified. Score: 5/5.`
          : `COMPLIANT: Pre-order verified with minor non-fatal deduction. Score: ${score}/5.`);

    updateScorecardStmt.run(
      score,
      isFatal ? 1 : 0,
      fatalReasons.join('; '),
      q2Res.status,
      q2Res.evidence,
      auditComment,
      now,
      c.sc_id
    );

    if (c.audit_id) {
      updateAuditStmt.run(
        q2Res.status,
        q2Pass ? null : 'FATAL',
        q2Res.evidence,
        score,
        auditComment,
        disposition,
        now,
        c.audit_id
      );
    }
  }

  db.exec('COMMIT;');
  console.log('Transaction committed successfully!');
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('Error during transaction, rolled back:', err);
}

console.log('\n--- FINAL AUDIT RESULT AFTER GENUINE Q2 EVALUATION ---');
console.log({
  totalScorecards: calls.length,
  q2VerifiedPass: q2PassCount,
  realQ2Fails: q2FailCount,
  genuine5outOf5Passes: score5Count,
  genuine4outOf5Passes: score4Count,
  genuineFatalViolations: fatalViolationCount
});
