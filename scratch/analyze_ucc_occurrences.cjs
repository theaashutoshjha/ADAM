const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT id, client_code, transcript, duration_seconds
  FROM calls
  WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL
  ORDER BY id ASC
`).all();

let exactCount = 0;
let spacedCount = 0;
let digitsOnlyCount = 0;
let noMatchCount = 0;
let emptyTranscriptCount = 0;

const sampleMatches = [];
const sampleNoMatches = [];

for (const c of calls) {
  if (!c.transcript || c.transcript.trim().length === 0) {
    emptyTranscriptCount++;
    continue;
  }

  const cleanUcc = (c.client_code || '').trim().toUpperCase();
  if (!cleanUcc) continue;

  const prefix = cleanUcc.slice(0, 3);
  const numPart = cleanUcc.slice(3);
  const nonZeroNumPart = numPart.replace(/^0+/, '');

  const tr = c.transcript;
  const trUpper = tr.toUpperCase();
  const trNoPunct = trUpper.replace(/[^A-Z0-9]/g, '');

  // 1. Direct UCC in transcript (with or without spaces)
  if (trNoPunct.includes(cleanUcc) || (nonZeroNumPart.length >= 4 && trNoPunct.includes(prefix + nonZeroNumPart))) {
    exactCount++;
    if (sampleMatches.length < 5) sampleMatches.push({ id: c.id, code: cleanUcc, type: 'EXACT', tr: tr.slice(0, 150) });
    continue;
  }

  // 2. Prefix + spaces + digits, e.g. "WIG 62920" or "W I G 62920"
  const spacedRegex = new RegExp(`(?:W\\s*I\\s*G|W\\s*I\\s*A|W\\s*I\\s*D|P\\s*W\\s*A|V\\s*I\\s*G|V\\s*I\\s*A|V\\s*I\\s*D|P\\s*V\\s*A)[^0-9a-zA-Z]{0,10}0?(${numPart}|${nonZeroNumPart})`, 'i');
  if (spacedRegex.test(tr)) {
    spacedCount++;
    if (sampleMatches.length < 10) sampleMatches.push({ id: c.id, code: cleanUcc, type: 'SPACED', tr: tr.slice(0, 150) });
    continue;
  }

  // 3. Spoken UCC cue + digits: "client id / code is 62920"
  const cueRegex = new RegExp(`(?:client\\s*(?:code|id|no)?|ucc|trading\\s*(?:code|id|account)|user\\s*id|your\\s*code)\\s*(?:is|number|no|code|id)?\\D{0,15}0?(${numPart}|${nonZeroNumPart})`, 'i');
  if (cueRegex.test(tr)) {
    digitsOnlyCount++;
    if (sampleMatches.length < 15) sampleMatches.push({ id: c.id, code: cleanUcc, type: 'CUE_DIGITS', tr: tr.slice(0, 150) });
    continue;
  }

  noMatchCount++;
  if (sampleNoMatches.length < 10) {
    sampleNoMatches.push({ id: c.id, code: cleanUcc, duration: c.duration_seconds, tr: tr.slice(0, 200) });
  }
}

console.log('=== CLIENT ID MATCH BREAKDOWN (1,033 PRE-ORDER CALLS) ===');
console.log('Total calls checked:', calls.length);
console.log('Empty transcript calls:', emptyTranscriptCount);
console.log('Exact UCC matches (e.g. WIG62920):', exactCount);
console.log('Spaced/phonetic prefix matches (e.g. W I G 62920):', spacedCount);
console.log('Verbal cue + digits matches (e.g. client code 62920):', digitsOnlyCount);
console.log('Total verified UCC passes:', exactCount + spacedCount + digitsOnlyCount);
console.log('No UCC spoken (genuine fails):', noMatchCount);

console.log('\n=== SAMPLE NO-MATCH CALLS (WHY THEY DID NOT MATCH) ===');
sampleNoMatches.forEach(m => {
  console.log(`Call #${m.id} [Expected: ${m.code}, Dur: ${m.duration}s]: "${m.tr.replace(/\n/g, ' ')}"`);
});
