const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const passes = db.prepare(`SELECT a.call_id, s.client_code, a.q2_evidence 
                           FROM audits a 
                           JOIN scorecards s ON a.call_id = s.call_id 
                           WHERE a.q2 = 'PASS'`).all();
console.log('Total PASS in audits:', passes.length);

const categories = {};
for (const p of passes) {
  const ev = p.q2_evidence || '';
  let cat = 'OTHER';
  if (ev.includes('exact spoken articulation')) cat = 'EXACT_UCC';
  else if (ev.includes('verified in dialogue (articulated as')) cat = 'PREFIX_OR_CUE';
  else if (ev.includes('numeric identifier articulated as')) cat = 'NUM_IN_CONTEXT';
  else if (ev.includes('verbally confirmed in dialogue')) cat = 'VERBALLY_CONFIRMED';
  else if (ev.includes('confirmed in dialogue:')) cat = 'CONFIRMED_IN_DIALOGUE';
  categories[cat] = (categories[cat] || 0) + 1;
}
console.log('PASS categories:', categories);

// Sample of NUM_IN_CONTEXT
const numInContext = passes.filter(p => (p.q2_evidence || '').includes('numeric identifier articulated as'));
console.log('Sample NUM_IN_CONTEXT (first 5):');
for (const nic of numInContext.slice(0, 5)) {
  console.log(`Call #${nic.call_id} [${nic.client_code}]: ${nic.q2_evidence}`);
}
