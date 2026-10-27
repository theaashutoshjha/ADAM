const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, c.transcript, c.duration_seconds, c.matched_trade_id, c.call_time, c.call_date
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL'
`).all();

let count = 0;
for (const r of rows) {
  const tr = (r.transcript || '').trim();
  const lower = tr.toLowerCase();
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const code = (r.client_code || '').trim().toUpperCase();
  const numPart = code.slice(3);
  const numNoZero = numPart.replace(/^0+/, '');
  const cleanTr = tr.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (cleanTr.includes(code)) continue;
  if (tr.includes('[Silence') || tr.includes('[Inaudible')) continue;
  if (/voicemail|record your message|forwarded to|person you are trying to reach/i.test(lower)) continue;
  if (words.length <= 15) continue;
  if ((numPart.length >= 4 && cleanTr.includes(numPart)) || (numNoZero.length >= 4 && cleanTr.includes(numNoZero))) continue;

  count++;
  if (count <= 15) {
    console.log(`=== Sample ${count} [Call #${r.call_id}, Client: ${code}, Trade: ${r.matched_trade_id}, Time: ${r.call_time}, Words: ${words.length}] ===`);
    console.log(tr);
  }
}
