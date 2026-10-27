import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const allCalls = db.prepare('SELECT id, duration_seconds, transcript, classification, call_type, customer_number, calling_number, client_code, call_time, call_date FROM calls').all() as any[];
const allTrades = db.prepare('SELECT id, client, client_number, phone_number, symbol, quantity, price, price_display, trade_time, trade_date FROM trades').all() as any[];

console.log(`Auditing all ${allCalls.length} calls against ${allTrades.length} trades...`);

// Voicemail / IVR phrases
const voicemailRegex = /\b(?:voice\s*mail|voicemail|forwarded|leave\s*a\s*message|record\s*your\s*message|record\s*your\s*name|person\s*is\s*available|trying\s*to\s*reach|at\s*the\s*tone|assistant\s*recording\s*this\s*call|google\s*assistant|switched\s*off|not\s*reachable|busy\s*right\s*now)\b/i;

// Trade action words
const tradeActionRegex = /\b(?:buy|sell|buying|selling|purchas\w+|order|orders|ordered|place\s*order|order\s*placed|order\s*place|put\s*option|call\s*option|\d+\s*(?:ce|pe|call|put)|shares?|lots?|cmp|market\s*price|limit\s*price|target\s*price|stoploss|square\s*off|intraday|delivery|holding|bhav|kharid\w*|bech\w*|kar\s*do|theek\s*hai|confirm\w*|le\s*lo|daal\s*do|lagao|laga\s*do|loss|profit|portfolio|exit|position|equity|derivative|futures?|options?|trade|trading)\b|ऑर्डर|खरीद\w*|बेच\w*|डाल\s*दो|ले\s*लो|शेयर|पुट|कन्फर्म|ट्रेड/i;

// Scored calls
const scoredCalls: any[] = [];

for (const c of allCalls) {
  const tx = (c.transcript || '').trim();
  const txLower = tx.toLowerCase();
  const dur = c.duration_seconds || 0;
  const words = tx.split(/\s+/).filter((w: string) => w.length > 0);
  const stripped = tx.replace(/\[.*?\]/g, '').replace(/ADVISOR:/gi, '').replace(/CLIENT:/gi, '').replace(/hello\??/gi, '').trim();

  // Filter out scrap
  if (dur < 8 || words.length < 15 || stripped.length < 20 || voicemailRegex.test(txLower) || txLower.includes('silence') || txLower.includes('no speech')) {
    continue;
  }

  // Filter out pure callback / schedule calls
  if (words.length <= 35 && /^(?:ADVISOR:\s*)?(?:hello\??\s*)?(?:hi\??\s*)?(?:call\s*(?:you\s*)?back|call\s*me\s*later|not\s*the\s*right\s*time|in\s*a\s*meeting|driving|call\s*after)[\s\S]*?(?:okay|thank\s*you|bye)?$/i.test(stripped) && !tradeActionRegex.test(tx)) {
    continue;
  }

  let score = 0;

  // Trading actions count
  const actionMatches = tx.match(new RegExp(tradeActionRegex.source, 'gi')) || [];
  score += actionMatches.length * 25;

  // Check trade link via phone
  const p = (c.customer_number || c.calling_number || '').replace(/\D/g, '').slice(-10);
  const code = (c.client_code || '').toUpperCase();

  const linkedTrades = allTrades.filter(t => {
    const tp = (t.phone_number || t.client_number || '').replace(/\D/g, '').slice(-10);
    const tc = (t.client || '').toUpperCase();
    return (p && tp === p) || (code && tc === code);
  });

  if (linkedTrades.length > 0) score += 100;

  // Client code mentioned
  if (/\b(?:WIA|WIG|UCC|client\s*code)\b/i.test(tx)) score += 60;

  // Numbers (quantities / strikes / prices)
  const numMatches = tx.match(/\b\d+(?:\.\d+)?\b/g) || [];
  score += Math.min(numMatches.length * 10, 80);

  // Duration bonus (longer substantive discussions)
  if (dur >= 20) score += 20;
  if (dur >= 45) score += 30;

  if (actionMatches.length > 0 || linkedTrades.length > 0) {
    scoredCalls.push({
      call: c,
      score,
      dur,
      words: words.length,
      actionCount: actionMatches.length,
      linkedTradesCount: linkedTrades.length,
      currentClass: c.classification
    });
  }
}

console.log(`Total Genuine Pre-Order Candidates Identified: ${scoredCalls.length}`);
scoredCalls.sort((a, b) => b.score - a.score);

// Top 1,177 calls
const top1177 = scoredCalls.slice(0, 1177);
const top1177Ids = new Set(top1177.map(s => s.call.id));

console.log(`Rank 1177 Score: ${top1177[1176].score}, Words: ${top1177[1176].words}, Actions: ${top1177[1176].actionCount}`);
console.log(`Snippet of Rank 1177:\n${top1177[1176].call.transcript.slice(0, 200)}`);

// How many of top 1177 are currently PRE_ORDER vs REGULAR vs SCRAP?
const topClassDist: Record<string, number> = {};
for (const s of top1177) {
  topClassDist[s.currentClass] = (topClassDist[s.currentClass] || 0) + 1;
}
console.log('Top 1,177 breakdown by current classification:', topClassDist);
