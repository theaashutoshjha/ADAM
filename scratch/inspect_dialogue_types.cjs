const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const preOrderCalls = db.prepare(`
  SELECT id, caller_id, calling_number, client_code, call_date, call_time,
         transcript, matched_trade_id
  FROM calls
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
  ORDER BY id ASC
`).all();

let silentCount = 0;
let voicemailCount = 0;
let shortHelloCount = 0;
let validDialogueCount = 0;

for (const c of preOrderCalls) {
  const t = (c.transcript || '').trim();
  if (!t || t === '[Silence / No speech detected]') {
    silentCount++;
  } else if (/voicemail|voice\s*mail|not\s+available|record\s+your\s+message|please\s+leave\s+a\s+message|forwarded\s+to|at\s+the\s+tone/i.test(t)) {
    voicemailCount++;
  } else if (/^(?:hello[\s?,.]*){1,5}$/i.test(t) || /call\s+you\s+back|call\s+back\s+later|busy\s+right\s+now/i.test(t) && t.length < 150) {
    shortHelloCount++;
  } else {
    validDialogueCount++;
  }
}

console.log({
  totalPreOrderCalls: preOrderCalls.length,
  silentCount,
  voicemailCount,
  shortHelloCount,
  validDialogueCount
});
