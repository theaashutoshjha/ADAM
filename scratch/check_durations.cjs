const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

console.log('Overall durations:');
console.log(db.prepare(`
  SELECT 
    MIN(duration_seconds) as min_dur,
    MAX(duration_seconds) as max_dur,
    AVG(duration_seconds) as avg_dur,
    COUNT(CASE WHEN duration_seconds = 0 THEN 1 END) as zero_dur,
    COUNT(CASE WHEN duration_seconds > 0 AND duration_seconds <= 10 THEN 1 END) as under_10s,
    COUNT(CASE WHEN duration_seconds > 10 AND duration_seconds <= 60 THEN 1 END) as s10_to_60,
    COUNT(CASE WHEN duration_seconds > 60 THEN 1 END) as over_60s
  FROM calls
`).get());

console.log('Pre-order call durations:');
console.log(db.prepare(`
  SELECT 
    MIN(duration_seconds) as min_dur,
    MAX(duration_seconds) as max_dur,
    AVG(duration_seconds) as avg_dur,
    COUNT(CASE WHEN duration_seconds = 0 THEN 1 END) as zero_dur,
    COUNT(CASE WHEN duration_seconds > 0 AND duration_seconds <= 10 THEN 1 END) as under_10s,
    COUNT(CASE WHEN duration_seconds > 10 AND duration_seconds <= 60 THEN 1 END) as s10_to_60,
    COUNT(CASE WHEN duration_seconds > 60 THEN 1 END) as over_60s
  FROM calls
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).get());

console.log('Top 15 longest pre-order calls:');
console.log(db.prepare(`
  SELECT id, caller_id, calling_number, duration_seconds, recording_url
  FROM calls
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
  ORDER BY duration_seconds DESC
  LIMIT 15
`).all());
