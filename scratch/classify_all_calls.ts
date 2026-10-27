import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { normalizePhoneNumber } from '../server/normalizer';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const allCalls = db.prepare('SELECT id, caller_id, duration_seconds, transcript, classification, call_type, customer_number, calling_number, client_code, call_time, call_date FROM calls').all() as any[];
const allTrades = db.prepare('SELECT id, client, client_number, phone_number, symbol, quantity, price, trade_time, trade_date FROM trades').all() as any[];

console.log(`Total calls: ${allCalls.length}, Total trades: ${allTrades.length}`);

// Let's create an exhaustive trading / pre-order dialogue classifier
const tradeKeywordRegex = /\b(?:buy|sell|order|shares?|lot|lots|cmp|market\s*price|limit|quantity|qty|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|confirmed|le\s*lo|daal\s*do|put|call|ce|pe|strike|target|stoploss|square\s*off|intraday|delivery|holding|nifty|banknifty|sensex|finnifty|midcpnifty|tata|reliance|infosys|hdfc|icici|adani|sbi|itc|wipro|lt|axis|kotak|maruti|bajaj)\b|ऑर्डर|खरीद|बेच|डाल\s*दो|ले\s*लो|शेयर|कॉल|पुट|कन्फर्म/i;

const voicemailRegex = /\b(?:voice\s*mail|voicemail|forwarded|leave\s*a\s*message|record\s*your\s*message|record\s*your\s*name|person\s*is\s*available|trying\s*to\s*reach|at\s*the\s*tone|assistant\s*recording\s*this\s*call|google\s*assistant|switched\s*off|not\s*reachable|busy)\b/i;

const callbackRegex = /\b(?:call\s*(?:you\s*)?back|call\s*me\s*later|not\s*the\s*right\s*time|in\s*a\s*meeting|driving|busy\s*right\s*now|call\s*after|lunch|later\s*on)\b/i;

let scrapCount = 0;
let regularCount = 0;
let strongPreOrderCount = 0;
let moderatePreOrderCount = 0;

const categorized = allCalls.map(c => {
  const tx = (c.transcript || '').trim();
  const dur = c.duration_seconds || 0;
  const words = tx.split(/\s+/).filter((w: string) => w.length > 0);
  const stripped = tx.replace(/\[.*?\]/g, '').replace(/ADVISOR:/gi, '').replace(/CLIENT:/gi, '').replace(/hello\??/gi, '').trim();

  // 1. Is it scrap?
  if (dur < 6 || words.length < 5 || stripped.length < 10 || voicemailRegex.test(tx) || tx.includes('silence') || tx.includes('no speech')) {
    scrapCount++;
    return { ...c, cat: 'SCRAP', words: words.length };
  }

  // 2. Is it a short hello / greeting with no substance?
  if (words.length < 15 && !tradeKeywordRegex.test(tx)) {
    scrapCount++;
    return { ...c, cat: 'SCRAP', words: words.length };
  }

  // 3. Does it have trade keywords?
  const hasTrade = tradeKeywordRegex.test(tx);
  const isCallback = callbackRegex.test(tx) && !hasTrade;

  if (isCallback) {
    regularCount++;
    return { ...c, cat: 'REGULAR', words: words.length };
  }

  if (hasTrade) {
    // Check if strong or moderate
    const matches = tx.match(new RegExp(tradeKeywordRegex.source, 'gi')) || [];
    if (matches.length >= 2 || words.length >= 30) {
      strongPreOrderCount++;
      return { ...c, cat: 'PRE_ORDER_STRONG', words: words.length, matches: matches.length };
    } else {
      moderatePreOrderCount++;
      return { ...c, cat: 'PRE_ORDER_MODERATE', words: words.length, matches: matches.length };
    }
  }

  // Otherwise regular
  regularCount++;
  return { ...c, cat: 'REGULAR', words: words.length };
});

console.log(`Initial Scan:`);
console.log(`SCRAP: ${scrapCount}`);
console.log(`REGULAR: ${regularCount}`);
console.log(`PRE_ORDER STRONG: ${strongPreOrderCount}`);
console.log(`PRE_ORDER MODERATE: ${moderatePreOrderCount}`);
console.log(`Total PRE_ORDER Candidates: ${strongPreOrderCount + moderatePreOrderCount}`);
