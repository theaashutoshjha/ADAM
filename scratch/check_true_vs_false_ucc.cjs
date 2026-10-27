const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, client_code, transcript
  FROM calls
  WHERE call_type = 'pre_order'
`).all();

let falsePositives = [];
let trueMatches = [];

for (const c of calls) {
  const t = (c.transcript || '').toLowerCase();
  const ucc = (c.client_code || '').trim().toUpperCase();
  const numPart = ucc.slice(3);
  if (!numPart || numPart.length < 4) continue;

  if (t.includes(numPart) && !t.includes(ucc.toLowerCase())) {
    const idx = t.indexOf(numPart);
    const snip = c.transcript.slice(Math.max(0, idx - 40), Math.min(c.transcript.length, idx + numPart.length + 40));
    
    // Check if the snippet is referring to quantity, strike, price, or time:
    // e.g. "at 43489", "strike 43489", "quantity 43489", "shares"
    const isTradeParam = /(?:strike|qty|quantity|shares|share|rupees|rs|price|level|lots|lot|at|above|below)\s*\D{0,5}\d+/i.test(snip);
    const hasUccCue = /(?:client|line|code|account|id|w|p|via|pw|aad|trading|credit)/i.test(snip);

    if (hasUccCue && !isTradeParam) {
      trueMatches.push({ id: c.id, ucc, numPart, snip });
    } else {
      falsePositives.push({ id: c.id, ucc, numPart, snip, isTradeParam, hasUccCue });
    }
  }
}

console.log(`True UCC matches with numPart: ${trueMatches.length}`);
console.log(`Potential false positives (strike/price/qty or no UCC cue): ${falsePositives.length}`);

console.log('\n--- Sample True Matches with NumPart ---');
for (const m of trueMatches.slice(0, 5)) {
  console.log(`[Call ${m.id}] UCC: ${m.ucc} -> "...${m.snip}..."`);
}

console.log('\n--- Sample Discarded False Positives ---');
for (const m of falsePositives.slice(0, 5)) {
  console.log(`[Call ${m.id}] UCC: ${m.ucc} -> "...${m.snip}..." (TradeParam: ${m.isTradeParam}, HasCue: ${m.hasUccCue})`);
}
