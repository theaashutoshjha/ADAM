import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { normalizePhoneNumber } from '../server/normalizer';

const dbPath = path.resolve('.data/auditeq_production.db');
const db = new DatabaseSync(dbPath);

const preOrders = db.prepare(`
  SELECT id, caller_id, customer_number, calling_number, call_time, duration_seconds, 
         classification, call_type, status, matched_trade_id, client_code, transcript
  FROM calls 
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as any[];

const orderKeywordsRegex = /\b(?:buy|sell|order|shares?|lot|cmp|market\s*price|limit|quantity|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do)\b/i;

console.log('Investigating 65 scrap calls in PRE_ORDER list:');
let replacableCount = 0;
let noCallFoundCount = 0;

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

    // Search other calls for this phone or client code
    const candidates = db.prepare(`
      SELECT id, call_time, duration_seconds, classification, transcript
      FROM calls
      WHERE id != ? AND (
        customer_number = ? OR calling_number = ? OR client_code = ?
      )
    `).all(call.id, phone, phone, clientCode) as any[];

    // Find if any candidate has genuine dialogue
    const genuineCandidate = candidates.find(c => {
      const cDur = c.duration_seconds || 0;
      const cTx = (c.transcript || '').toLowerCase();
      const cSilence = cTx.includes('silence') || cTx.includes('no speech') || cTx.trim() === '';
      const cVm = cTx.includes('voice mail') || cTx.includes('voicemail') || cTx.includes('forwarded');
      return cDur >= 6 && !cSilence && !cVm && (cDur >= 15 || orderKeywordsRegex.test(cTx));
    });

    if (genuineCandidate) {
      replacableCount++;
      console.log(`[REPLACEABLE] Scrap Call #${call.id} (dur: ${dur}s, "${tx.slice(0, 30)}...") has GENUINE Candidate Call #${genuineCandidate.id} (dur: ${genuineCandidate.duration_seconds}s, time: ${genuineCandidate.call_time}, class: ${genuineCandidate.classification}, "${genuineCandidate.transcript.slice(0, 40)}...")`);
    } else {
      noCallFoundCount++;
    }
  }
}

console.log(`\nSummary:`);
console.log(`Scrap calls with genuine alternative call: ${replacableCount}`);
console.log(`Scrap calls with no other call found: ${noCallFoundCount}`);
