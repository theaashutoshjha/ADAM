const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Check before
const scBefore = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
const badCallsBefore = db.prepare("SELECT count(*) as c FROM calls WHERE (audit_status = 'AUDITED' OR status = 'audited') AND (transcript IS NULL OR length(trim(transcript)) < 15)").get().c;
console.log('Before cleanup:', { scorecards: scBefore, badAuditedCalls: badCallsBefore });

// 1. Delete orphan scorecards and audits without transcripts
const delSc = db.prepare(`
  DELETE FROM scorecards 
  WHERE call_id = 0 
     OR call_id NOT IN (SELECT id FROM calls WHERE transcript IS NOT NULL AND length(trim(transcript)) >= 15)
`).run();
console.log('Deleted synthetic scorecards:', delSc.changes);

const delAud = db.prepare(`
  DELETE FROM audits 
  WHERE call_id = 0 
     OR call_id NOT IN (SELECT id FROM calls WHERE transcript IS NOT NULL AND length(trim(transcript)) >= 15)
`).run();
console.log('Deleted synthetic audits:', delAud.changes);

// 2. Fix status of calls without transcripts
const fixCalls = db.prepare(`
  UPDATE calls SET
    audit_status = 'MISSING_AUDIO',
    status = 'missing_recording',
    pipeline_stage = 'MISSING_RECORDING'
  WHERE (transcript IS NULL OR length(trim(transcript)) < 15)
    AND (audit_status = 'AUDITED' OR status = 'audited')
`).run();
console.log('Updated calls without transcript to missing_recording:', fixCalls.changes);

// Check after
const scAfter = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
const scWithTranscripts = db.prepare('SELECT count(*) as c FROM scorecards s JOIN calls c ON s.call_id = c.id WHERE c.transcript IS NOT NULL AND length(trim(c.transcript)) >= 15').get().c;
const badCallsAfter = db.prepare("SELECT count(*) as c FROM calls WHERE (audit_status = 'AUDITED' OR status = 'audited') AND (transcript IS NULL OR length(trim(transcript)) < 15)").get().c;
console.log('After cleanup:', { 
  totalScorecards: scAfter, 
  scorecardsWithRealTranscripts: scWithTranscripts, 
  badAuditedCallsRemaining: badCallsAfter 
});
