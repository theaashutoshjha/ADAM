const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

// Direct query

const calls = db.prepare(`
  SELECT id, client_code, transcript
  FROM calls
  WHERE call_type = 'pre_order'
`).all();

// Let's inspect calls where number appeared in context
for (const c of calls) {
  const t = (c.transcript || '').toLowerCase();
  const ucc = (c.client_code || '').trim().toUpperCase();
  const numPart = ucc.slice(3);
  if (!numPart || numPart.length < 4) continue;

  if (t.includes(numPart) && !t.includes(ucc.toLowerCase())) {
    const idx = t.indexOf(numPart);
    const snip = c.transcript.slice(Math.max(0, idx - 40), Math.min(c.transcript.length, idx + numPart.length + 40));
    console.log(`[Call #${c.id}] UCC: ${ucc} (Num: ${numPart})`);
    console.log(`  Snippet: "...${snip}..."`);
    console.log(`  Full: "${c.transcript}"\n`);
  }
}
