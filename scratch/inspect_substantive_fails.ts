import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT c.id, c.client_code, c.transcript, c.duration_seconds
  FROM calls c
  WHERE c.call_type = 'pre_order' OR c.classification = 'PRE_ORDER'
  ORDER BY c.id ASC
`).all() as any[];

const fails = calls.filter(c => {
  const t = (c.transcript || '').trim();
  const lower = t.toLowerCase();
  return t.length > 80 && !lower.includes('voicemail') && !lower.includes('silence');
});

console.log('Total substantive dialogue calls:', fails.length);
console.log('Sample 10 full transcripts:\n');

for (let i = 0; i < Math.min(10, fails.length); i++) {
  const f = fails[i];
  console.log(`================ CALL #${f.id} [Expected UCC: ${f.client_code}] ===============`);
  console.log(f.transcript);
  console.log('\n');
}
