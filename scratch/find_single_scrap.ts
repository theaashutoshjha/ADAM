import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { normalizePhoneNumber } from '../server/normalizer';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));
const preOrders = db.prepare("SELECT * FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'").all() as any[];

for (const call of preOrders) {
  const dur = call.duration_seconds || 0;
  const tx = (call.transcript || '').toLowerCase();
  const isSilence = tx.includes('silence') || tx.includes('no speech') || tx.trim() === '';
  const isVoicemail = tx.includes('voice mail') || tx.includes('voicemail') || tx.includes('forwarded') || tx.includes('record your name') || tx.includes('leave a message');
  const isShort = dur < 6;

  if (isSilence || isVoicemail || isShort) {
    const tradeId = call.matched_trade_id;
    let trade = tradeId ? db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId) as any : null;
    const phone = normalizePhoneNumber(call.customer_number || call.calling_number || trade?.customer_number || trade?.phone_number || '');
    const clientCode = call.client_code || trade?.client || trade?.client_code;

    const candidates = db.prepare('SELECT id, call_time, duration_seconds, classification, transcript FROM calls WHERE id != ? AND (customer_number = ? OR calling_number = ? OR client_code = ?)').all(call.id, phone, phone, clientCode) as any[];

    const genuine = candidates.filter(c => {
      const cDur = c.duration_seconds || 0;
      const cTx = (c.transcript || '').toLowerCase();
      return cDur >= 6 && !cTx.includes('silence') && !cTx.includes('no speech') && !cTx.includes('voice mail') && !cTx.includes('voicemail') && !cTx.includes('forwarded');
    });

    if (genuine.length === 0) {
      console.log('Call with NO genuine candidate:', {
        callId: call.id,
        caller_id: call.caller_id,
        phone,
        clientCode,
        dur,
        tx: tx.slice(0, 100),
        trade
      });
    }
  }
}
