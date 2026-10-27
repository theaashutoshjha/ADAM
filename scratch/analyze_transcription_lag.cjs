const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const db = new DatabaseSync('.data/auditeq_production.db');

console.log('=== 1. SPOKEN LANGUAGE DISTRIBUTION IN CALLS TABLE ===');
const langDist = db.prepare(`
  SELECT spoken_language, count(*) as count
  FROM calls
  WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL
  GROUP BY spoken_language
`).all();
console.log('Spoken languages:', langDist);

console.log('\n=== 2. TRANSCRIPTION COMPLETION / TRUNCATION ANALYSIS ===');
// Let's check duration vs transcript word count and last timestamp
const calls = db.prepare(`
  SELECT id, client_code, duration_seconds, spoken_language, transcript
  FROM calls
  WHERE call_type = 'pre_order' OR classification = 'PRE_ORDER' OR matched_trade_id IS NOT NULL
`).all();

let severeDropCount = 0; // calls where words per minute < 20
let normalCount = 0;
let emptyCount = 0;
let lastTimestampMismatchCount = 0;

const stats = [];

for (const c of calls) {
  const tr = (c.transcript || '').trim();
  if (tr.length === 0 || tr.includes('[Silence') || tr.includes('[Inaudible')) {
    emptyCount++;
    continue;
  }

  // Extract all timestamps: e.g. [0:05], [1:23]
  const timestamps = [...tr.matchAll(/\[(\d+):(\d+)\]/g)].map(m => parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  // Words count
  const words = tr.replace(/\[\d+:\d+\]\s*(?:ADVISOR|CLIENT):/g, '').trim().split(/\s+/).filter(Boolean);
  const wpm = c.duration_seconds > 0 ? (words.length / (c.duration_seconds / 60)) : 0;

  if (wpm < 20 && c.duration_seconds > 15) {
    severeDropCount++;
    if (stats.length < 10) {
      stats.push({
        id: c.id,
        code: c.client_code,
        dur: c.duration_seconds,
        maxTs,
        words: words.length,
        wpm: Math.round(wpm),
        lang: c.spoken_language,
        snippet: tr.slice(0, 100).replace(/\n/g, ' ')
      });
    }
  } else {
    normalCount++;
  }
}

console.log(`Total calls: ${calls.length}`);
console.log(`Calls with severe word drops (wpm < 20 on calls > 15s): ${severeDropCount}`);
console.log(`Normal speaking rate calls: ${normalCount}`);
console.log(`Empty/silence calls: ${emptyCount}`);

console.log('\n=== SAMPLE DROPPED TRANSCRIPTS ===');
stats.forEach(s => {
  console.log(`Call #${s.id} [${s.code}] (Dur: ${s.dur}s, LastTs: ${s.maxTs}s, Words: ${s.words}, WPM: ${s.wpm}, Lang: ${s.lang}): "${s.snippet}"`);
});
