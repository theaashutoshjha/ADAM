const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare(`
  SELECT id, client_code, dealer_name, caller_name, transcript, duration_seconds
  FROM calls
  WHERE call_type = 'pre_order'
  ORDER BY client_code ASC, id ASC
`).all();

console.log(`Analyzing ${calls.length} pre-order calls across client codes...`);

// Group by client code
const byClient = {};
for (const c of calls) {
  const code = c.client_code || 'UNKNOWN';
  if (!byClient[code]) byClient[code] = [];
  byClient[code].push(c);
}

const codes = Object.keys(byClient).sort((a, b) => byClient[b].length - byClient[a].length);
console.log(`Top 15 Client Codes by call volume:`);
for (const code of codes.slice(0, 15)) {
  console.log(`  Client Code: ${code} -> ${byClient[code].length} calls`);
}

// Let's inspect the top 5 client codes in detail:
// WID56889, WIG62920, WIA43489, PWA03264, PWA04415
for (const topCode of codes.slice(0, 5)) {
  const clientCalls = byClient[topCode];
  console.log(`\n======================================================`);
  console.log(`Client ${topCode} (Total ${clientCalls.length} calls)`);
  console.log(`======================================================`);
  
  let withMention = 0;
  let withoutMention = 0;
  const numPart = topCode.slice(3);
  const prefix = topCode.slice(0, 3);

  for (const c of clientCalls) {
    const t = (c.transcript || '').toLowerCase();
    // Check if any mention of UCC, prefix, or numPart occurs
    const hasMention = t.includes(numPart) || t.includes(prefix.toLowerCase()) || 
                       /(?:client|code|account|id|plain|credit|line|claim|training|trading|w|p)/i.test(t);
    if (hasMention) withMention++;
    else withoutMention++;
  }

  console.log(`Mentioned UCC cues: ${withMention}, No cues (Silence/Pure trading/Voicemail): ${withoutMention}`);
}
