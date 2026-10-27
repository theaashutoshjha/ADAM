const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, s.q2_status, s.q2_evidence, c.transcript, c.call_type, c.classification, c.duration_seconds
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL'
`).all();

console.log('Total Q2 Failures in scorecards:', rows.length);

let reasons = {
  is_scrap_call: 0,
  voicemail_in_transcript: 0,
  silence_in_transcript: 0,
  under_15_words: 0,
  has_spoken_digits_or_phonetic: 0,
  has_exact_client_code_in_transcript: 0,
  genuine_conversation_without_ucc: 0
};

const samplesWithUccInTranscript = [];
const samplesWithDigitsOrPhonetic = [];
const samplesUnder15Words = [];

for (const r of rows) {
  const tr = (r.transcript || '').trim();
  const lower = tr.toLowerCase();
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const code = (r.client_code || '').trim().toUpperCase();
  const numPart = code.slice(3);
  const numNoZero = numPart.replace(/^0+/, '');
  const cleanTr = tr.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (cleanTr.includes(code)) {
    reasons.has_exact_client_code_in_transcript++;
    if (samplesWithUccInTranscript.length < 5) samplesWithUccInTranscript.push({ id: r.call_id, code, text: tr.slice(0, 150) });
    continue;
  }

  if (tr.includes('[Silence') || tr.includes('[Inaudible')) {
    reasons.silence_in_transcript++;
    continue;
  }

  if (/voicemail|record your message|forwarded to|person you are trying to reach/i.test(lower)) {
    reasons.voicemail_in_transcript++;
    continue;
  }

  if (words.length <= 15) {
    reasons.under_15_words++;
    if (samplesUnder15Words.length < 5) samplesUnder15Words.push({ id: r.call_id, code, words: words.length, text: tr.slice(0, 150) });
    continue;
  }

  if ((numPart.length >= 4 && cleanTr.includes(numPart)) || (numNoZero.length >= 4 && cleanTr.includes(numNoZero))) {
    reasons.has_spoken_digits_or_phonetic++;
    if (samplesWithDigitsOrPhonetic.length < 5) samplesWithDigitsOrPhonetic.push({ id: r.call_id, code, text: tr.slice(0, 150) });
    continue;
  }

  reasons.genuine_conversation_without_ucc++;
}

console.log('Breakdown of 709 Q2 Failures:');
console.log(reasons);

console.log('\n--- Samples with Exact UCC in Transcript but failed Q2 ---');
console.log(samplesWithUccInTranscript);

console.log('\n--- Samples with Numeric Digits in Transcript but failed Q2 ---');
console.log(samplesWithDigitsOrPhonetic);

console.log('\n--- Samples with Under 15 Words ---');
console.log(samplesUnder15Words);
