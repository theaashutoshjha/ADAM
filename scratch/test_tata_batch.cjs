const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const preOrders = db.prepare(`
  SELECT id, caller_id, recording_url 
  FROM calls 
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND recording_url IS NOT NULL AND length(recording_url) > 20
  LIMIT 10
`).all();

async function testTataBatch() {
  for (const c of preOrders) {
    try {
      const res = await fetch(c.recording_url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const len = res.headers.get('content-length');
      const ct = res.headers.get('content-type');
      console.log(`Call #${c.id} (${c.caller_id}): Status ${res.status}, Length: ${len}, Type: ${ct}`);
    } catch (e) {
      console.log(`Call #${c.id} failed:`, e.message);
    }
  }
}

testTataBatch();
