const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Helper to convert time "HH:MM:SS" or "HH:MM" to seconds
function timeToSeconds(t) {
  if (!t) return 0;
  const parts = t.trim().split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

// 1. Fetch all trades
const trades = db.prepare('SELECT * FROM trades ORDER BY trade_time ASC, id ASC').all();
console.log('Total trades in database:', trades.length);

// 2. Fetch all calls
const calls = db.prepare('SELECT id, phone_number, customer_number, calling_number, call_time, call_date, duration_seconds, transcript FROM calls').all();
console.log('Total calls in database:', calls.length);

// Map calls by clean 10-digit phone
const callsByPhone = new Map();
for (const c of calls) {
  const rawP = c.customer_number || c.calling_number || c.phone_number || '';
  const p = rawP.replace(/\D/g, '').slice(-10);
  if (p && p.length === 10) {
    if (!callsByPhone.has(p)) callsByPhone.set(p, []);
    callsByPhone.get(p).push(c);
  }
}

// Check scrap calls
function isScrap(call) {
  const dur = call.duration_seconds || 0;
  const tr = (call.transcript || '').trim();
  const lower = tr.toLowerCase();
  if (dur > 0 && dur < 10) return { scrap: true, reason: 'duration < 10s' };
  if (!tr || tr.includes('[Silence') || tr.includes('[Inaudible')) return { scrap: true, reason: 'silence' };
  if (/voicemail|record your message|forwarded to|person you are trying to reach|switched off|not answering/i.test(lower)) return { scrap: true, reason: 'voicemail' };
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= 10 && words.every(w => /^(?:hello|sir|hi|ha|haan|ji|ye|ho|oh|yeah|okay|so)+$/i.test(w.replace(/[^a-zA-Z]/g, '')))) return { scrap: true, reason: 'unanswered greeting' };
  return { scrap: false };
}

let mailConfirmations = 0;
let tradesWithCalls = 0;
let matchedPreOrderCalls = new Map(); // callId -> tradeId
let unmatchedTrades = 0;

for (const t of trades) {
  const rawP = (t.customer_number || t.client_number || t.phone_number || '').replace(/\D/g, '').slice(-10);
  const tradeSec = timeToSeconds(t.trade_time);

  if (!rawP || rawP.length !== 10 || !callsByPhone.has(rawP)) {
    // Number exist in trade data but not in call data = mail confirmation
    mailConfirmations++;
    continue;
  }

  tradesWithCalls++;
  const clientCalls = callsByPhone.get(rawP);

  // Filter out scrap calls & find call made just before the trade execution time
  const validPriorCalls = [];
  for (const c of clientCalls) {
    const s = isScrap(c);
    if (s.scrap) continue; // Scrap call

    const callSec = timeToSeconds(c.call_time);
    const delta = tradeSec - callSec;

    // Call made just before trade execution time (delta >= -30s to 7200s)
    if (delta >= -30 && delta <= 7200) {
      validPriorCalls.push({ call: c, callSec, delta });
    }
  }

  if (validPriorCalls.length === 0) {
    // If no prior non-scrap call found within 2h, check any prior call
    for (const c of clientCalls) {
      const s = isScrap(c);
      if (s.scrap) continue;
      const callSec = timeToSeconds(c.call_time);
      if (callSec <= tradeSec + 60) {
        validPriorCalls.push({ call: c, callSec, delta: tradeSec - callSec });
      }
    }
  }

  if (validPriorCalls.length > 0) {
    // Pick the call made JUST BEFORE the trade execution time (closest delta >= -30)
    validPriorCalls.sort((a, b) => a.delta - b.delta);
    const bestCall = validPriorCalls[0].call;
    matchedPreOrderCalls.set(bestCall.id, t.id);
  } else {
    unmatchedTrades++;
  }
}

console.log('=== USER SPECIFICATION RECONCILIATION RESULTS ===');
console.log('Total Trades:', trades.length);
console.log('1. Mail Confirmations (Phone in trade data but NOT in call data):', mailConfirmations);
console.log('2. Trades with Calls:', tradesWithCalls);
console.log('3. Distinct Pre-Order Calls Identified (Closest prior non-scrap call):', matchedPreOrderCalls.size);
console.log('4. Trades where only scrap calls existed (voicemail/silence):', unmatchedTrades);
