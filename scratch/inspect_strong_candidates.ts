import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const allCalls = db.prepare('SELECT id, caller_id, duration_seconds, transcript, classification, call_type, customer_number, calling_number, client_code, call_time, call_date FROM calls').all() as any[];

const tradeKeywordRegex = /\b(?:buy|sell|order|shares?|lot|lots|cmp|market\s*price|limit|quantity|qty|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|confirmed|le\s*lo|daal\s*do|put|call|ce|pe|strike|target|stoploss|square\s*off|intraday|delivery|holding|nifty|banknifty|sensex|finnifty|midcpnifty|tata|reliance|infosys|hdfc|icici|adani|sbi|itc|wipro|lt|axis|kotak|maruti|bajaj)\b|ऑर्डर|खरीद|बेच|डाल\s*दो|ले\s*लो|शेयर|कॉल|पुट|कन्फर्म/i;

const voicemailRegex = /\b(?:voice\s*mail|voicemail|forwarded|leave\s*a\s*message|record\s*your\s*message|record\s*your\s*name|person\s*is\s*available|trying\s*to\s*reach|at\s*the\s*tone|assistant\s*recording\s*this\s*call|google\s*assistant|switched\s*off|not\s*reachable|busy)\b/i;

const callbackRegex = /\b(?:call\s*(?:you\s*)?back|call\s*me\s*later|not\s*the\s*right\s*time|in\s*a\s*meeting|driving|busy\s*right\s*now|call\s*after|lunch|later\s*on)\b/i;

const strongCandidates: any[] = [];

for (const c of allCalls) {
  const tx = (c.transcript || '').trim();
  const dur = c.duration_seconds || 0;
  const words = tx.split(/\s+/).filter((w: string) => w.length > 0);
  const stripped = tx.replace(/\[.*?\]/g, '').replace(/ADVISOR:/gi, '').replace(/CLIENT:/gi, '').replace(/hello\??/gi, '').trim();

  if (dur < 6 || words.length < 5 || stripped.length < 10 || voicemailRegex.test(tx) || tx.includes('silence') || tx.includes('no speech')) {
    continue;
  }
  if (words.length < 15 && !tradeKeywordRegex.test(tx)) {
    continue;
  }
  const hasTrade = tradeKeywordRegex.test(tx);
  const isCallback = callbackRegex.test(tx) && !hasTrade;
  if (isCallback) continue;

  if (hasTrade) {
    const matches = tx.match(new RegExp(tradeKeywordRegex.source, 'gi')) || [];
    if (matches.length >= 2 || words.length >= 30) {
      strongCandidates.push({ ...c, wordCount: words.length, matchCount: matches.length });
    }
  }
}

console.log('Strong candidates count:', strongCandidates.length);

// Check current classifications of strong candidates:
const classDist: Record<string, number> = {};
for (const sc of strongCandidates) {
  classDist[sc.classification] = (classDist[sc.classification] || 0) + 1;
}
console.log('Current classification distribution of strong candidates:', classDist);

// Let's sample 5 strong candidates currently marked as REGULAR or SCRAP:
const misclassified = strongCandidates.filter(c => c.classification !== 'PRE_ORDER');
console.log(`\nStrong pre-orders misclassified as REGULAR/SCRAP: ${misclassified.length}`);
for (const m of misclassified.slice(0, 5)) {
  console.log(`Call ${m.id} (Dur: ${m.duration_seconds}s, Class: ${m.classification}, Words: ${m.wordCount}):`);
  console.log(m.transcript.slice(0, 200));
}
