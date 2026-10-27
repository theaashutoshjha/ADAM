const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const matchedCalls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds
  FROM calls c
  WHERE c.id IN (SELECT DISTINCT matched_call_id FROM trades WHERE matched_call_id IS NOT NULL)
`).all();

console.log('Total Matched Pre-Order Calls:', matchedCalls.length);

let exactMatch = 0;
let numericOrPhonetic = 0;
let failed = 0;
const failSamples = [];

for (const c of matchedCalls) {
  const code = (c.client_code || '').trim().toUpperCase();
  const num = code.slice(3);
  const numNoZero = num.replace(/^0+/, '');
  const tr = (c.transcript || '').toUpperCase();
  const cleanTr = tr.replace(/[^A-Z0-9]/g, '');

  if (cleanTr.includes(code)) {
    exactMatch++;
    continue;
  }

  // Spoken digits or entity cleaned
  const unEntitied = tr.replace(/₹\s*(\d+)/g, '$1')
                       .replace(/FIVE\s*,?\s*SIX\s*,?\s*(\d+)/g, '56$1');
  const cleanUnEntitied = unEntitied.replace(/[^A-Z0-9]/g, '');

  if ((num.length >= 4 && (cleanTr.includes(num) || cleanUnEntitied.includes(num))) ||
      (numNoZero.length >= 4 && (cleanTr.includes(numNoZero) || cleanUnEntitied.includes(numNoZero)))) {
    numericOrPhonetic++;
    continue;
  }

  failed++;
  if (failSamples.length < 10) {
    failSamples.push({ id: c.id, code, tr: (c.transcript || '').slice(0, 150).replace(/\n/g, ' ') });
  }
}

console.log('Exact UCC Match:', exactMatch);
console.log('Numeric / Verbal / De-entitied Match:', numericOrPhonetic);
console.log('Total PASS on Matched Pre-Orders:', exactMatch + numericOrPhonetic, '(' + (((exactMatch + numericOrPhonetic) / matchedCalls.length) * 100).toFixed(1) + '%)');
console.log('Total FAIL:', failed, '(' + ((failed / matchedCalls.length) * 100).toFixed(1) + '%)');
console.log('\nFail Samples:');
failSamples.forEach(f => console.log('Call #' + f.id + ' [' + f.code + ']: ' + f.tr));
