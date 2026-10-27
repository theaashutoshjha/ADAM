const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const fails = db.prepare(`SELECT a.call_id, s.client_code, c.transcript 
                          FROM audits a 
                          JOIN scorecards s ON a.call_id = s.call_id 
                          JOIN calls c ON a.call_id = c.id
                          WHERE a.q2 = 'FAIL'`).all();
console.log('Total FAILS in audits:', fails.length);

let potentialMisses = [];

for (const f of fails) {
  const t = (f.transcript || '').toLowerCase();
  const code = (f.client_code || '').toLowerCase();
  const digits = code.replace(/\D/g, '');
  const prefix = code.replace(/\d/g, '');

  // Look for any mention of the digits
  const hasDigits = digits.length >= 4 && t.includes(digits);
  
  // Look for spoken UCC phrases
  const hasUccCue = /(?:client\s*code|client\s*id|ucc|trading\s*code|account\s*code)/i.test(t);

  // Look for prefix
  const hasPrefix = prefix && (t.includes(prefix) || t.includes('double u') || t.includes('w i') || t.includes('wid') || t.includes('wig') || t.includes('wia') || t.includes('pwa'));

  if (hasDigits || (hasUccCue && hasPrefix)) {
    potentialMisses.push({
      call_id: f.call_id,
      client_code: f.client_code,
      hasDigits,
      hasUccCue,
      hasPrefix,
      transcriptSnippet: f.transcript.slice(0, 200).replace(/\n/g, ' ')
    });
  }
}

console.log('Fails with digits or UCC cues:', potentialMisses.length);
console.log('Next potential misses:');
console.log(JSON.stringify(potentialMisses.slice(10), null, 2));
