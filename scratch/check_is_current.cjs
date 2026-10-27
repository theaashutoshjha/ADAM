const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const scCurrent = db.prepare('SELECT is_current, count(*) as count FROM scorecards GROUP BY is_current').all();
console.log('Scorecards is_current distribution:', scCurrent);

const callsAuditStatus = db.prepare('SELECT audit_status, count(*) as count FROM calls WHERE classification = "PRE_ORDER" GROUP BY audit_status').all();
console.log('Pre-order calls audit_status:', callsAuditStatus);

const callsTransStatus = db.prepare('SELECT transcript_status, count(*) as count FROM calls WHERE classification = "PRE_ORDER" GROUP BY transcript_status').all();
console.log('Pre-order calls transcript_status:', callsTransStatus);
