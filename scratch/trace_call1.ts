import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const allCalls = db.prepare('SELECT * FROM calls ORDER BY id ASC').all() as any[];

function isCallScrap(c: any): { isScrap: boolean; reason: string } {
  const dur = c.duration_seconds || 0;
  const tx = (c.transcript || '').trim().toLowerCase();

  if (dur < 6) return { isScrap: true, reason: 'Duration < 6 seconds (short hangup)' };
  if (!tx || tx === '[silence / no speech detected]' || tx.includes('silence / no speech detected')) {
    return { isScrap: true, reason: 'Silence / No speech detected' };
  }
  if (
    tx.includes('voice mail') ||
    tx.includes('voicemail') ||
    tx.includes('forwarded') ||
    tx.includes('leave a message') ||
    tx.includes('record your message') ||
    tx.includes('record your name and reason') ||
    tx.includes('person is available') ||
    tx.includes('person you are trying to reach') ||
    tx.includes('at the tone')
  ) {
    return { isScrap: true, reason: 'Automated carrier voicemail / call screening IVR' };
  }
  // Pure hello with no substance
  const stripped = tx.replace(/hello\??/g, '').replace(/\[.*?\]/g, '').replace(/advisor:/g, '').replace(/client:/g, '').trim();
  if (dur < 20 && stripped.length < 10 && !tx.includes('buy') && !tx.includes('sell') && !tx.includes('order')) {
    return { isScrap: true, reason: 'Unanswered hello exchange with no conversation' };
  }

  return { isScrap: false, reason: '' };
}

const scrap = allCalls.filter(c => isCallScrap(c).isScrap);
const genuine = allCalls.filter(c => !isCallScrap(c).isScrap);

console.log(`Call 1 in scrap? ${scrap.some(c => c.id === 1)}`);
console.log(`Call 1 in genuine? ${genuine.some(c => c.id === 1)}`);
