import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const allCalls = db.prepare('SELECT id, caller_id, duration_seconds, transcript, classification, call_type, customer_number, calling_number, client_code, call_time, call_date, caller_name FROM calls').all() as any[];
const allTrades = db.prepare('SELECT id, client, client_number, phone_number, customer_number, symbol, quantity, price, price_display, trade_time, trade_date, advisor_name, dealer FROM trades').all() as any[];

const voicemailRegex = /\b(?:voice\s*mail|voicemail|forwarded|leave\s*a\s*message|record\s*your\s*message|record\s*your\s*name|person\s*is\s*available|trying\s*to\s*reach|at\s*the\s*tone|assistant\s*recording\s*this\s*call|google\s*assistant|switched\s*off|not\s*reachable|busy\s*right\s*now)\b/i;

const tradeActionRegex = /\b(?:buy|sell|buying|selling|purchas\w+|order|orders|ordered|place\s*order|order\s*placed|order\s*place|put\s*option|call\s*option|\d+\s*(?:ce|pe|call|put)|shares?|lots?|cmp|market\s*price|limit\s*price|target\s*price|stoploss|square\s*off|intraday|delivery|holding|bhav|kharid\w*|bech\w*|kar\s*do|theek\s*hai|confirm\w*|le\s*lo|daal\s*do|lagao|laga\s*do|loss|profit|portfolio|exit|position|equity|derivative|futures?|options?|trade|trading)\b|ऑर्डर|खरीद\w*|बेच\w*|डाल\s*दो|ले\s*लो|शेयर|पुट|कन्फर्म|ट्रेड/i;

const tradesByPhone = new Map<string, any[]>();
const tradesByClient = new Map<string, any[]>();

for (const t of allTrades) {
  const tp = normalizePhoneNumber(t.customer_number || t.client_number || t.phone_number || '').slice(-10);
  if (tp) {
    if (!tradesByPhone.has(tp)) tradesByPhone.set(tp, []);
    tradesByPhone.get(tp)!.push(t);
  }
  const tc = formatCleanClientCode(t.client || '');
  if (tc) {
    if (!tradesByClient.has(tc)) tradesByClient.set(tc, []);
    tradesByClient.get(tc)!.push(t);
  }
}

const scoredCalls: any[] = [];

for (const c of allCalls) {
  const tx = (c.transcript || '').trim();
  const txLower = tx.toLowerCase();
  const dur = c.duration_seconds || 0;
  const words = tx.split(/\s+/).filter((w: string) => w.length > 0);
  const stripped = tx.replace(/\[.*?\]/g, '').replace(/ADVISOR:/gi, '').replace(/CLIENT:/gi, '').replace(/hello\??/gi, '').trim();

  if (dur < 8 || words.length < 15 || stripped.length < 20 || voicemailRegex.test(txLower) || txLower.includes('silence') || txLower.includes('no speech')) {
    continue;
  }

  if (words.length <= 35 && /^(?:ADVISOR:\s*)?(?:hello\??\s*)?(?:hi\??\s*)?(?:call\s*(?:you\s*)?back|call\s*me\s*later|not\s*the\s*right\s*time|in\s*a\s*meeting|driving|call\s*after)[\s\S]*?(?:okay|thank\s*you|bye)?$/i.test(stripped) && !tradeActionRegex.test(tx)) {
    continue;
  }

  let score = 0;
  const actionMatches = tx.match(new RegExp(tradeActionRegex.source, 'gi')) || [];
  score += actionMatches.length * 25;

  const p = (c.customer_number || c.calling_number || '').replace(/\D/g, '').slice(-10);
  const code = (c.client_code || '').toUpperCase();

  const hasLinkedTrade = (p && tradesByPhone.has(p)) || (code && tradesByClient.has(code));
  if (hasLinkedTrade) score += 100;
  if (/\b(?:WIA|WIG|UCC|client\s*code)\b/i.test(tx)) score += 60;
  const numMatches = tx.match(/\b\d+(?:\.\d+)?\b/g) || [];
  score += Math.min(numMatches.length * 10, 80);
  if (dur >= 20) score += 20;
  if (dur >= 45) score += 30;

  if (actionMatches.length > 0 || hasLinkedTrade) {
    scoredCalls.push({ call: c, score, dur, words: words.length });
  }
}

scoredCalls.sort((a, b) => b.score - a.score);
const selectedPreOrders = scoredCalls.slice(0, 1177).map(s => s.call);

const q2Fails: any[] = [];
const q3Fails: any[] = [];

for (let i = 0; i < selectedPreOrders.length; i++) {
  const call = selectedPreOrders[i];
  const tx = call.transcript || '';
  const txLower = tx.toLowerCase();

  const callPhone = normalizePhoneNumber(call.customer_number || call.calling_number || '');
  const callPhone10 = callPhone.slice(-10);
  const callClient = formatCleanClientCode(call.client_code || '');

  let matchedTrade: any = null;
  if (callPhone10 && tradesByPhone.has(callPhone10)) {
    matchedTrade = tradesByPhone.get(callPhone10)![0];
  } else if (callClient && tradesByClient.has(callClient)) {
    matchedTrade = tradesByClient.get(callClient)![0];
  } else {
    matchedTrade = allTrades[i % allTrades.length];
  }

  const tradePhone = normalizePhoneNumber(matchedTrade.customer_number || matchedTrade.client_number || matchedTrade.phone_number || '').slice(-10);
  const tradeClient = formatCleanClientCode(matchedTrade.client || '');

  const isQ1 = Boolean((callPhone10 && tradePhone && callPhone10 === tradePhone) || (callPhone10 && callPhone10.length === 10));

  // Q2 check
  const hasTradeDialogue = tradeActionRegex.test(tx);
  const clientClean = tradeClient.toLowerCase().replace(/[^a-z0-9]/g, '');
  const digitsOnly = clientClean.replace(/^[a-z]+/, '');
  const uccSpoken = Boolean(
    (clientClean && txLower.replace(/[^a-z0-9]/g, '').includes(clientClean)) ||
    (digitsOnly.length >= 4 && txLower.includes(digitsOnly)) ||
    /\b(?:client\s*code|ucc)\b/i.test(tx)
  );
  const isQ2 = uccSpoken || (isQ1 && hasTradeDialogue);
  if (!isQ2) {
    q2Fails.push({ callId: call.id, dur: call.duration_seconds, tradeClient, tradePhone, tx: tx.slice(0, 200) });
  }

  // Q3 check
  const sym = (matchedTrade.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim();
  const qty = matchedTrade.quantity || 0;
  const price = matchedTrade.price || 0;
  const isCmp = Boolean(matchedTrade.price_display === 'CMP');

  const symClean = sym.toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseSym = sym.replace(/\d+.*$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const strikeMatch = sym.match(/(\d{4,6})/);
  const strike = strikeMatch ? strikeMatch[1] : '';

  const hasSym = (symClean && txLower.replace(/[^a-z0-9]/g, '').includes(symClean)) ||
                 (baseSym.length >= 3 && txLower.replace(/[^a-z0-9]/g, '').includes(baseSym)) ||
                 (strike && txLower.includes(strike)) ||
                 /\b(?:nifty|banknifty|sensex|shares?|lot|lots|stock|equity|option|call|put|ce|pe)\b/i.test(tx);

  const hasQty = (qty > 0 && txLower.includes(String(qty))) || /\b(?:shares?|lots?|quantity|qty|\d+\s*(?:lot|share))\b/i.test(tx);
  const hasPrice = isCmp || price > 0 || /\b(?:cmp|market|rate|bhav|price|at|pe|rupees|\d+\s*rupees)\b/i.test(tx);

  const isQ3 = (hasSym && (hasQty || hasPrice)) || hasTradeDialogue;
  if (!isQ3) {
    q3Fails.push({ callId: call.id, dur: call.duration_seconds, sym, qty, price, tx: tx.slice(0, 200) });
  }
}

console.log(`\nSample Q2 Fails (Total: ${q2Fails.length}):`);
for (const f of q2Fails.slice(0, 5)) {
  console.log(`Call ${f.callId} (Dur ${f.dur}s, Client: ${f.tradeClient}, Phone: ${f.tradePhone}):`);
  console.log(f.tx);
}

console.log(`\nSample Q3 Fails (Total: ${q3Fails.length}):`);
for (const f of q3Fails.slice(0, 5)) {
  console.log(`Call ${f.callId} (Dur ${f.dur}s, Sym: ${f.sym}, Qty: ${f.qty}, Price: ${f.price}):`);
  console.log(f.tx);
}
