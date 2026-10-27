import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript
  FROM calls c
  WHERE c.call_type = 'pre_order' OR c.classification = 'PRE_ORDER'
  ORDER BY c.id ASC
`).all() as any[];

console.log('Searching for ASR acoustic patterns across all 1033 calls...');

let foundMangled = 0;
const examples: any[] = [];

for (const c of calls) {
  const t = c.transcript || '';
  const ucc = (c.client_code || '').trim().toUpperCase();
  const digits = ucc.replace(/\D/g, '');
  const prefix = ucc.slice(0, 3);

  // Look for currency mangled: w $, double a $, ₹, etc.
  const hasCurrencyPfx = /[wW]\s*[$₹][\d.,]+/i.test(t) || /double\s*[aA]\s*[$₹][\d.,]+/i.test(t);
  
  // Look for digit subsequence in transcript
  const has3Digits = digits.length >= 4 && (t.includes(digits.slice(0, 4)) || t.includes(digits.slice(1)) || t.includes(digits.slice(0, 3)));
  
  // Look for cue words
  const hasCue = /(?:client|trading|account|claim|plain|heading|check|credit|user)\s*(?:code|id|no|portal|date)?/i.test(t);

  if (hasCurrencyPfx || (hasCue && has3Digits)) {
    foundMangled++;
    if (examples.length < 20) {
      examples.push({ id: c.id, ucc, snippet: t.slice(0, 180).replace(/\n/g, ' ') });
    }
  }
}

console.log('Total calls with acoustic/ASR mangled client code patterns:', foundMangled);
console.log('First 20 examples:');
console.log(JSON.stringify(examples, null, 2));
