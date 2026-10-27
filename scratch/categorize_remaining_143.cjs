const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare(`
  SELECT s.call_id, s.client_code, c.transcript, c.call_time, c.duration_seconds
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
  WHERE s.q2_status = 'FAIL'
`).all();

console.log('Total remaining Q2 Failures:', rows.length);

let reasons = {
  hindi_script_no_english: 0,
  very_short_call: 0,
  no_order_terms: 0,
  has_order_terms_no_ucc: 0,
};

for (const r of rows) {
  const tr = (r.transcript || '').trim();
  const lower = tr.toLowerCase();
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

  if (/[\u0900-\u097F]/.test(tr)) {
    reasons.hindi_script_no_english++;
  } else if (words.length <= 15) {
    reasons.very_short_call++;
  } else if (!/\b(?:buy|sell|order|shares?|lot|cmp|market|price|limit|quantity)\b/i.test(lower)) {
    reasons.no_order_terms++;
  } else {
    reasons.has_order_terms_no_ucc++;
  }
}

console.log('Reasons breakdown of remaining 143:', reasons);
