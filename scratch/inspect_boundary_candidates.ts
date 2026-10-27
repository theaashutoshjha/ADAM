import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const allCalls = db.prepare('SELECT id, caller_id, duration_seconds, transcript, classification, call_type, customer_number, calling_number, client_code, call_time, call_date FROM calls').all() as any[];
const allTrades = db.prepare('SELECT id, client, symbol, quantity, price, trade_time, trade_date FROM trades').all() as any[];

const tradeSymbols = new Set<string>();
for (const t of allTrades) {
  const s = (t.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim().toUpperCase();
  if (s) tradeSymbols.add(s);
  const baseMatch = s.match(/^([A-Z]+)/);
  if (baseMatch && baseMatch[1].length >= 3) {
    tradeSymbols.add(baseMatch[1]);
  }
}

const explicitTradeActionRegex = /\b(?:buy|sell|buying|selling|purchas\w+|order|orders|ordered|place\s*order|order\s*placed|order\s*place|put\s*option|call\s*option|\d+\s*(?:ce|pe|call|put)|shares?|lots?|cmp|market\s*price|limit\s*price|target\s*price|stoploss|square\s*off|intraday|delivery|holding|bhav|kharid\w*|bech\w*|kar\s*do|theek\s*hai|confirm\w*|le\s*lo|daal\s*do|lagao|laga\s*do|loss|profit|portfolio|exit|position|equity|derivative|futures?|options?|trade|trading)\b|ऑर्डर|खरीद\w*|बेच\w*|डाल\s*दो|ले\s*लो|शेयर|पुट|कन्फर्म|ट्रेड/i;

const voicemailRegex = /\b(?:voice\s*mail|voicemail|forwarded|leave\s*a\s*message|record\s*your\s*message|record\s*your\s*name|person\s*is\s*available|trying\s*to\s*reach|at\s*the\s*tone|assistant\s*recording\s*this\s*call|google\s*assistant|switched\s*off|not\s*reachable|busy\s*right\s*now)\b/i;

const pureCallbackRegex = /^(?:ADVISOR:\s*)?(?:hello\??\s*)?(?:hi\??\s*)?(?:call\s*(?:you\s*)?back|call\s*me\s*later|not\s*the\s*right\s*time|in\s*a\s*meeting|driving|call\s*after|later\s*on)[\s\S]*?(?:okay|thank\s*you|bye)?$/i;

let preOrderCandidates: any[] = [];

for (const c of allCalls) {
  const tx = (c.transcript || '').trim();
  const dur = c.duration_seconds || 0;
  const words = tx.split(/\s+/).filter((w: string) => w.length > 0);
  const stripped = tx.replace(/\[.*?\]/g, '').replace(/ADVISOR:/gi, '').replace(/CLIENT:/gi, '').replace(/hello\??/gi, '').trim();

  if (dur < 6 || words.length < 5 || stripped.length < 10 || voicemailRegex.test(tx) || tx.includes('silence') || tx.includes('no speech')) {
    continue;
  }
  if (words.length <= 40 && pureCallbackRegex.test(stripped) && !explicitTradeActionRegex.test(tx)) {
    continue;
  }

  let score = 0;
  const actionMatches = tx.match(new RegExp(explicitTradeActionRegex.source, 'gi')) || [];
  score += actionMatches.length * 20;

  const txUpper = tx.toUpperCase();
  const txClean = txUpper.replace(/[^A-Z0-9]/g, '');
  let symbolFound = '';
  for (const sym of tradeSymbols) {
    if (sym.length >= 4) {
      if (txUpper.includes(sym) || txClean.includes(sym)) {
        score += 50;
        symbolFound = sym;
        break;
      }
    }
  }

  if (/\b(?:WIA|WIG|UCC|client\s*code)\b/i.test(tx)) {
    score += 40;
  }

  if (/\b(?:\d+\s*(?:shares?|lots?|rupees|rs\.?|qty|points?))\b/i.test(tx)) {
    score += 30;
  }

  if (score >= 20) {
    preOrderCandidates.push({ call: c, score, words: words.length, actionMatches: actionMatches.length, symbolFound });
  }
}

console.log(`Pre-order candidates with score >= 20: ${preOrderCandidates.length}`);
preOrderCandidates.sort((a, b) => b.score - a.score);

// Let's inspect calls around index 1150-1200
console.log('\nCandidates rank 1160 to 1180:');
for (let i = 1160; i < Math.min(1180, preOrderCandidates.length); i++) {
  const p = preOrderCandidates[i];
  console.log(`Rank ${i+1}: Call ${p.call.id} (Score: ${p.score}, Words: ${p.words}, Actions: ${p.actionMatches}, Sym: ${p.symbolFound})`);
  console.log(p.call.transcript.slice(0, 150));
}
