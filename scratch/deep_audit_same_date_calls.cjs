const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`SELECT id, calling_number, customer_number, call_date, call_time, client_code, transcript, duration_seconds FROM calls`).all();
const trades = db.prepare(`SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, notes FROM trades`).all();

const tradesByPhoneDate = new Map();
for (const t of trades) {
  const p = String(t.phone_number || '').replace(/\D/g, '').slice(-10);
  const d = t.trade_date ? t.trade_date.trim() : '';
  if (p && d) {
    const key = `${p}_${d}`;
    if (!tradesByPhoneDate.has(key)) tradesByPhoneDate.set(key, []);
    tradesByPhoneDate.get(key).push(t);
  }
}

let accurateSpeechCount = 0;
let silenceOrVoicemailCount = 0;
let scripMatchedCount = 0;
let clientCodeMatchedCount = 0;
let fullMatchCount = 0;

const matchedRecords = [];

for (const call of calls) {
  const p1 = String(call.calling_number || '').replace(/\D/g, '').slice(-10);
  const p2 = String(call.customer_number || '').replace(/\D/g, '').slice(-10);
  const d = call.call_date ? call.call_date.trim() : '';

  const trs = (p1 && d && tradesByPhoneDate.get(`${p1}_${d}`)) || (p2 && d && tradesByPhoneDate.get(`${p2}_${d}`));
  if (!trs || trs.length === 0) continue;

  const t = (call.transcript || '').toLowerCase();
  const isSilenceOrVm = !t || t === '[silence / no speech detected]' ||
    /voicemail|voice\s*mail|not\s+available|record\s+your\s+message|please\s+leave\s+a\s+message|forwarded\s+to|at\s+the\s+tone/i.test(t) ||
    /^(?:hello[\s?,.]*){1,5}$/i.test(t.trim()) ||
    (/call\s+you\s+back|call\s+back\s+later|busy\s+right\s+now|baad\s+me\s+baat/i.test(t) && t.length < 150) ||
    t.length < 15;

  if (isSilenceOrVm) {
    silenceOrVoicemailCount++;
    matchedRecords.push({ call, trades: trs, status: 'SILENCE_OR_VM', reason: 'Unanswered / Voicemail / Silence' });
    continue;
  }

  accurateSpeechCount++;

  // Check client UCC in transcript
  const clientUcc = (call.client_code || trs[0].client || '').trim().toUpperCase();
  const clientDigits = clientUcc.replace(/^[A-Z]+/, '');
  const uccSpoken = clientUcc && (t.includes(clientUcc.toLowerCase()) || (clientDigits.length >= 4 && t.includes(clientDigits)));
  if (uccSpoken) clientCodeMatchedCount++;

  // Check if ANY trade symbol of that day is mentioned in the transcript
  let anySymMatched = false;
  let matchedTrade = null;
  for (const tr of trs) {
    const sym = (tr.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').toLowerCase();
    const baseSym = sym.replace(/\d{1,2}[a-z]{3}\d{2,}.*$/, '').trim();
    const strikeMatch = sym.match(/(\d{3,6})(ce|pe)$/i);

    if (sym && t.includes(sym)) {
      anySymMatched = true;
      matchedTrade = tr;
      break;
    }
    if (baseSym && baseSym.length >= 3 && t.includes(baseSym)) {
      anySymMatched = true;
      matchedTrade = tr;
      break;
    }
    if (strikeMatch) {
      const strike = strikeMatch[1];
      if (t.includes(strike)) {
        anySymMatched = true;
        matchedTrade = tr;
        break;
      }
    }
  }

  if (anySymMatched) scripMatchedCount++;
  if (uccSpoken && anySymMatched) fullMatchCount++;

  matchedRecords.push({
    call,
    trades: trs,
    status: 'DIALOGUE',
    uccSpoken,
    anySymMatched,
    matchedTrade
  });
}

console.log({
  totalSameDateCalls: matchedRecords.length,
  silenceOrVoicemailCount,
  accurateSpeechCount,
  clientCodeMatchedCount,
  scripMatchedCount,
  fullMatchCount
});
