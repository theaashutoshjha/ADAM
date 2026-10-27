const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const total = db.prepare('SELECT count(1) as c FROM scorecards').get().c;
const q2Pass = db.prepare("SELECT count(1) as c FROM scorecards WHERE q2_status = 'PASS'").get().c;
const q2Fail = db.prepare("SELECT count(1) as c FROM scorecards WHERE q2_status = 'FAIL'").get().c;
const q1Fail = db.prepare("SELECT count(1) as c FROM scorecards WHERE q1_status = 'FAIL'").get().c;
const q3Fail = db.prepare("SELECT count(1) as c FROM scorecards WHERE q3_status = 'FAIL'").get().c;
const q4Fail = db.prepare("SELECT count(1) as c FROM scorecards WHERE q4_status = 'FAIL'").get().c;
const q5Fail = db.prepare("SELECT count(1) as c FROM scorecards WHERE q5_status = 'FAIL'").get().c;

console.log({
  totalScorecards: total,
  q1Fail,
  q2Pass,
  q2Fail,
  q2FailureRate: ((q2Fail / total) * 100).toFixed(1) + '%',
  q3Fail,
  q4Fail,
  q5Fail
});
