const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

// Require our evaluator
const fs = require('fs');
const evalScript = fs.readFileSync('scratch/evaluate_accurate_q2.cjs', 'utf8');

// Load existing scorecards
const scorecards = db.prepare(`
  SELECT s.*, c.transcript
  FROM scorecards s
  JOIN calls c ON s.call_id = c.id
`).all();

console.log(`Simulating audit scorecards update across ${scorecards.length} scorecards...`);

// Extract the evaluateQ2Accurate function from evaluate_accurate_q2.cjs or include it
const evalModule = require('./scratch/evaluate_accurate_q2.cjs'); // wait, let's include function directly

