import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const db = new DatabaseSync('.data/auditeq_production.db');

// Get all 802 failed pre-order calls
const failedCalls = db.prepare(`
  SELECT c.id, c.client_code, c.customer_number, c.calling_number, c.call_time, c.duration_seconds, c.storage_path, c.transcript, a.q2_evidence
  FROM calls c
  JOIN audits a ON c.id = a.call_id
  WHERE a.q2 = 'FAIL'
  ORDER BY c.id ASC
`).all() as any[];

console.log('Total Q2 FAIL calls:', failedCalls.length);

// Analyze reasons:
let silenceCount = 0;
let voicemailCount = 0;
let shortGreetingCount = 0;
let substantiveDialogueCount = 0;

for (const c of failedCalls) {
  const t = (c.transcript || '').trim();
  const lower = t.toLowerCase();
  if (!t || lower.includes('silence') || lower.includes('no speech') || t.length < 15) {
    silenceCount++;
  } else if (lower.includes('voicemail') || lower.includes('forwarded to') || lower.includes('record your message')) {
    voicemailCount++;
  } else if (t.length < 40 && /^(?:hello\??\s*|sir,?\s*|\.\s*)+$/i.test(t)) {
    shortGreetingCount++;
  } else {
    substantiveDialogueCount++;
  }
}

console.log({
  silenceCount,
  voicemailCount,
  shortGreetingCount,
  substantiveDialogueCount
});

// Take 10 substantive dialogue calls and look at their client_code vs transcript
const sampleDialogue = failedCalls.filter(c => {
  const t = (c.transcript || '').trim();
  const lower = t.toLowerCase();
  return t.length > 50 && !lower.includes('voicemail') && !lower.includes('silence');
}).slice(0, 10);

console.log('\n--- 10 Sample Substantive Dialogue Calls that Failed Q2 ---');
for (const s of sampleDialogue) {
  console.log(`\nCall #${s.id} | Expected Client Code: ${s.client_code} | Duration: ${s.duration_seconds}s`);
  console.log('Audio file:', s.storage_path, 'Exists:', fs.existsSync(s.storage_path));
  console.log('Transcript snippet:', s.transcript.slice(0, 250).replace(/\n/g, ' '));
}
