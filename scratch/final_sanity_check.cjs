const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const totalScorecards = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
const totalAudits = db.prepare('SELECT count(*) as c FROM audits').get().c;
const totalCalls = db.prepare('SELECT count(*) as c FROM calls').get().c;
const preOrderCalls = db.prepare("SELECT count(*) as c FROM calls WHERE classification = 'PRE_ORDER'").get().c;
const auditedCalls = db.prepare("SELECT count(*) as c FROM calls WHERE classification = 'PRE_ORDER' AND audit_status = 'AUDITED'").get().c;
const transcribedCalls = db.prepare("SELECT count(*) as c FROM calls WHERE classification = 'PRE_ORDER' AND transcript_status = 'VALID'").get().c;

console.log('Sanity Check:');
console.log(`Total calls in DB: ${totalCalls}`);
console.log(`Pre-order calls: ${preOrderCalls}`);
console.log(`Transcribed pre-orders: ${transcribedCalls}`);
console.log(`Audited pre-orders: ${auditedCalls}`);
console.log(`Total scorecards: ${totalScorecards}`);
console.log(`Total audits: ${totalAudits}`);
