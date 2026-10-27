const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT id, client_code, transcript
  FROM calls
  WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL
  ORDER BY id ASC
`).all();

const digitOnlyMatches = [];

for (const c of calls) {
  if (!c.transcript || !c.client_code) continue;
  const cleanUcc = c.client_code.trim().toUpperCase();
  const numPart = cleanUcc.slice(3);
  const nonZeroNumPart = numPart.replace(/^0+/, '');

  const tr = c.transcript;
  const trUpper = tr.toUpperCase();
  const trNoPunct = trUpper.replace(/[^A-Z0-9]/g, '');

  // If already matched full UCC, skip
  if (trNoPunct.includes(cleanUcc)) continue;

  // Check if the 5 digits or nonZeroNumPart appear anywhere in the transcript
  if (numPart.length >= 4 && (tr.includes(numPart) || (nonZeroNumPart.length >= 4 && tr.includes(nonZeroNumPart)))) {
    // Find snippet around the number
    const idx = tr.indexOf(numPart) !== -1 ? tr.indexOf(numPart) : tr.indexOf(nonZeroNumPart);
    const snip = tr.slice(Math.max(0, idx - 40), Math.min(tr.length, idx + 50)).replace(/\n/g, ' ');
    digitOnlyMatches.push({ id: c.id, code: cleanUcc, numPart, snip });
  }
}

console.log('Calls containing the digits of client code (without exact prefix):', digitOnlyMatches.length);
console.log('Sample digit matches and their context:');
digitOnlyMatches.slice(0, 15).forEach(m => {
  console.log(`Call #${m.id} [${m.code}]: "...${m.snip}..."`);
});
