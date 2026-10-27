const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const SPOKEN_DIGITS = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9'
};

function normalizeWordsToDigits(text) {
  let s = text.toLowerCase();
  s = s.replace(/double\s+([a-z0-9]+)/gi, (_, w) => (SPOKEN_DIGITS[w] || w) + (SPOKEN_DIGITS[w] || w));
  s = s.replace(/triple\s+([a-z0-9]+)/gi, (_, w) => (SPOKEN_DIGITS[w] || w) + (SPOKEN_DIGITS[w] || w) + (SPOKEN_DIGITS[w] || w));
  for (const [w, d] of Object.entries(SPOKEN_DIGITS)) {
    s = s.replace(new RegExp('\\b' + w + '\\b', 'gi'), d);
  }
  return s;
}

const matchedCalls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds
  FROM calls c
  WHERE c.id IN (SELECT DISTINCT matched_call_id FROM trades WHERE matched_call_id IS NOT NULL)
`).all();

let userPass = 0;
let failSpokenWords = 0;
let failScrapOrSilent = 0;
let failHindiPrefix = 0;
let failUnexplained = 0;
const unexplainedList = [];

for (const c of matchedCalls) {
  const code = (c.client_code || '').trim().toUpperCase();
  const num = code.slice(3);
  const numNoZero = num.replace(/^0+/, '');
  const tr = (c.transcript || '').toUpperCase();
  const cleanTr = tr.replace(/[^A-Z0-9]/g, '');

  if (cleanTr.includes(code)) {
    userPass++;
    continue;
  }

  const unEntitied = tr.replace(/₹\s*(\d+)/g, '$1').replace(/FIVE\s*,?\s*SIX\s*,?\s*(\d+)/g, '56$1');
  const cleanUnEntitied = unEntitied.replace(/[^A-Z0-9]/g, '');

  if ((num.length >= 4 && (cleanTr.includes(num) || cleanUnEntitied.includes(num))) ||
      (numNoZero.length >= 4 && (cleanTr.includes(numNoZero) || cleanUnEntitied.includes(numNoZero)))) {
    userPass++;
    continue;
  }

  // Check why it failed in user's script
  if (!tr || tr.includes('SILENCE') || tr.includes('VOICEMAIL') || c.duration_seconds < 6) {
    failScrapOrSilent++;
    continue;
  }

  const spokenDigitsTr = normalizeWordsToDigits(tr).replace(/[^A-Z0-9]/g, '');
  if (spokenDigitsTr.includes(code) || spokenDigitsTr.includes(num) || (numNoZero.length >= 4 && spokenDigitsTr.includes(numNoZero))) {
    failSpokenWords++;
    continue;
  }

  if (tr.includes('W आइए') || tr.includes('डब्लू') || tr.includes('पी डब्लू')) {
    failHindiPrefix++;
    continue;
  }

  failUnexplained++;
  if (unexplainedList.length < 15) {
    unexplainedList.push({ id: c.id, code, tr: c.transcript.slice(0, 120).replace(/\n/g, ' ') });
  }
}

console.log({
  total: matchedCalls.length,
  userPass,
  failScrapOrSilent,
  failSpokenWords,
  failHindiPrefix,
  failUnexplained
});

console.log('\nSample Unexplained (where transcript truly has no UCC spoken):');
unexplainedList.forEach(u => console.log('Call #' + u.id + ' [' + u.code + ']: ' + u.tr));
