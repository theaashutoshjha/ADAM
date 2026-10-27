const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare(`
  SELECT s.id as sc_id, s.call_id, s.client, s.score, s.is_fatal, s.fatal_reasons, 
         s.q1_status, s.q2_status, s.q3_status, s.q4_status, s.q5_status,
         s.q1_evidence, s.q2_evidence, s.q3_evidence, 
         c.transcript, t.symbol, t.quantity, t.price
  FROM scorecards s 
  JOIN calls c ON s.call_id = c.id 
  LEFT JOIN trades t ON c.matched_trade_id = t.id
  ORDER BY s.call_id ASC
`).all();

console.log('Total scorecards checked:', calls.length);

// Let's find cases where:
// 1. Score is 5/5 BUT transcript does NOT mention stock or does NOT mention client ID!
const falsePasses = [];
for (const row of calls) {
  const t = (row.transcript || '').toLowerCase();
  const sym = (row.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').toLowerCase();
  const baseSym = sym.replace(/\d{1,2}[a-z]{3}\d{2,}.*$/, '').trim();
  const client = (row.client || '').toLowerCase();
  const clientDigits = client.replace(/^[a-z]+/, '');

  const clientInTrans = client && (t.includes(client) || (clientDigits.length >= 4 && t.includes(clientDigits)));
  const symInTrans = sym && (t.includes(sym) || (baseSym.length >= 3 && t.includes(baseSym)));

  if (row.score === 5 && (!clientInTrans || !symInTrans)) {
    falsePasses.push({
      call_id: row.call_id,
      client: row.client,
      clientInTrans,
      symbol: row.symbol,
      symInTrans,
      score: row.score,
      q2_ev: row.q2_evidence,
      q3_ev: row.q3_evidence,
      snippet: t.slice(0, 150)
    });
  }
}

console.log(`Found ${falsePasses.length} calls with 5/5 where client ID or stock is NOT in transcript!`);
console.log('Sample false passes:', falsePasses.slice(0, 5));

// 2. Cases where stock AND client ID ARE in transcript, BUT score is NOT 5/5 or is FATAL!
const falseFatals = [];
for (const row of calls) {
  const t = (row.transcript || '').toLowerCase();
  const sym = (row.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').toLowerCase();
  const baseSym = sym.replace(/\d{1,2}[a-z]{3}\d{2,}.*$/, '').trim();
  const client = (row.client || '').toLowerCase();
  const clientDigits = client.replace(/^[a-z]+/, '');

  const clientInTrans = client && (t.includes(client) || (clientDigits.length >= 4 && t.includes(clientDigits)));
  const symInTrans = sym && (t.includes(sym) || (baseSym.length >= 3 && t.includes(baseSym)));

  if ((row.is_fatal === 1 || row.q3_status === 'FAIL') && (clientInTrans || symInTrans)) {
    falseFatals.push({
      call_id: row.call_id,
      client: row.client,
      clientInTrans,
      symbol: row.symbol,
      symInTrans,
      is_fatal: row.is_fatal,
      q1: row.q1_status,
      q2: row.q2_status,
      q3: row.q3_status,
      fatal_reasons: row.fatal_reasons,
      snippet: t.slice(0, 180)
    });
  }
}

console.log(`Found ${falseFatals.length} calls where details were in transcript BUT was marked fatal/failed!`);
console.log('Sample false fatals:', falseFatals.slice(0, 5));
