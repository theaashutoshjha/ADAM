import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const preOrders = db.prepare(`
  SELECT id, caller_id, duration_seconds, transcript, classification, call_type, client_code
  FROM calls
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as any[];

console.log(`Total pre_order calls in calls table: ${preOrders.length}`);

const junkCalls: any[] = [];
for (const c of preOrders) {
  const dur = c.duration_seconds || 0;
  const tx = (c.transcript || '').toLowerCase().trim();
  
  const isSilence = tx === '' || tx === '[silence / no speech detected]' || tx.includes('silence / no speech detected');
  const isVoicemail = tx.includes('voice mail') || tx.includes('voicemail') || tx.includes('forwarded') || tx.includes('record your message') || tx.includes('record your name and reason') || tx.includes('leave a message');
  const isScreening = tx.includes("i'll see if this person is available") || tx.includes('this person is not available');
  const isJustHello = dur < 20 && !tx.includes('buy') && !tx.includes('sell') && !tx.includes('share') && !tx.includes('stock') && !tx.includes('order') && (
    tx.replace(/hello\??/g, '').replace(/\[.*?\]/g, '').replace(/advisor:/g, '').replace(/client:/g, '').trim().length < 15
  );
  const isTooShort = dur < 8 && !tx.includes('buy') && !tx.includes('sell');

  if (isSilence || isVoicemail || isScreening || isJustHello || isTooShort) {
    junkCalls.push({
      id: c.id,
      dur,
      reason: isSilence ? 'SILENCE' : isVoicemail ? 'VOICEMAIL' : isScreening ? 'SCREENING' : isJustHello ? 'JUST_HELLO' : 'TOO_SHORT',
      snippet: tx.slice(0, 100)
    });
  }
}

console.log(`Junk/Scrap calls found in PRE_ORDER: ${junkCalls.length}`);
console.log('Sample junk calls:');
console.log(junkCalls.slice(0, 20));
