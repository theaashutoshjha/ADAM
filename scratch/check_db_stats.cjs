const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const totalCalls = db.prepare('SELECT count(*) as c FROM calls').get().c;
const preOrderCalls = db.prepare("SELECT count(*) as c FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'").get().c;
const transcribed = db.prepare("SELECT count(*) as c FROM calls WHERE transcript IS NOT NULL AND length(trim(transcript)) > 0").get().c;
const auditedCalls = db.prepare("SELECT count(*) as c FROM calls WHERE audit_status = 'AUDITED'").get().c;
const totalScorecards = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
const scorecardsWithTranscripts = db.prepare('SELECT count(*) as c FROM scorecards s JOIN calls c ON s.call_id = c.id WHERE c.transcript IS NOT NULL AND length(trim(c.transcript)) > 0').get().c;
const missingRecordingCalls = db.prepare("SELECT count(*) as c FROM calls WHERE status = 'missing_recording' OR audit_status = 'MISSING_AUDIO'").get().c;

const bad = db.prepare("SELECT count(*) as c FROM calls WHERE (audit_status = 'AUDITED' OR status = 'audited') AND (transcript IS NULL OR length(trim(transcript)) = 0)").get().c;
console.log({ totalCalls, preOrderCalls, transcribed, auditedCalls, badAuditedWithoutTranscript: bad, totalScorecards, scorecardsWithTranscripts, missingRecordingCalls });
