// =============================================================
// Stage 8: AUTHORITATIVE UNIFIED SCORING (5-Point Fixed Formula)
//
// Scoring Rules (5 Max Points):
// Q1 FAIL -> 0/5 (Fatal)
// Q2 FAIL -> 0/5 (Fatal)
// Q3 FAIL -> 4/5 (Non-Fatal, -1 deduction)
// Q4 -> IGNORED (0 deduction, represented as N/A)
// Q5 FAIL -> 0/5 (Fatal)
// ALL PASS -> 5/5
// =============================================================

import type { StageAuditResult, StageScoreResult, ScoreObject, ScoreQuestionItem } from './types';
export type { StageAuditResult, StageScoreResult, ScoreObject, ScoreQuestionItem };

/**
 * Authoritative Pure Scoring Engine Function (ARCHITECTURE §12, RULES D-07)
 */
export function scoreAudit(
  audit: StageAuditResult,
  scoringConfig?: {
    version?: string;
    rule_set_version?: string;
    weights?: Record<string, number>;
    fatal?: Record<string, boolean>;
  }
): ScoreObject {
  const version = scoringConfig?.version || 'SC-1';
  const ruleSetVersion = scoringConfig?.rule_set_version || '2.1.0-production-lock';

  const defaultWeights: Record<string, number> = { Q1: 1, Q2: 1, Q3: 1, Q4: 1, Q5: 1 };
  const weights = scoringConfig?.weights || defaultWeights;
  const fatalMap = scoringConfig?.fatal || { Q1: true, Q2: true, Q3: false, Q4: false, Q5: true };

  const normalizeStatus = (qid: string, s?: string): 'PASS' | 'FAIL' | 'UNDETERMINED' | 'NOT_AUDITED' => {
    if (s === 'PASS') return 'PASS';
    if (s === 'FAIL') return 'FAIL';
    if (qid === 'Q4') return 'PASS'; // User mandate: Q4 ALWAYS PASS
    return 'UNDETERMINED';
  };

  const rawStatuses: Record<string, 'PASS' | 'FAIL' | 'UNDETERMINED' | 'NOT_AUDITED'> = {
    Q1: normalizeStatus('Q1', audit.q1?.status),
    Q2: normalizeStatus('Q2', audit.q2?.status),
    Q3: normalizeStatus('Q3', audit.q3?.status),
    Q4: normalizeStatus('Q4', audit.q4?.status || 'PASS'),
    Q5: normalizeStatus('Q5', audit.q5?.status),
  };

  const questions: ScoreQuestionItem[] = (['Q1', 'Q2', 'Q3', 'Q4', 'Q5'] as const).map((qid) => {
    const status = rawStatuses[qid];
    const weight = weights[qid] ?? 1;
    const fatal = Boolean(fatalMap[qid]);
    const applicable = weight > 0;
    // Q1..Q5 each award 1 mark on PASS (max 5/5)
    const awarded = (applicable && status === 'PASS') ? weight : 0;
    return {
      id: qid,
      status,
      weight,
      fatal,
      applicable,
      awarded,
    };
  });

  const denominator = questions.reduce((sum, q) => (q.applicable ? sum + q.weight : sum), 0);
  const totalAwarded = questions.reduce((sum, q) => (q.applicable ? sum + q.awarded : sum), 0);

  const hasFatalFail = questions.some((q) => q.fatal && q.status === 'FAIL');
  const hasFatalUndetermined = questions.some((q) => q.fatal && q.status === 'UNDETERMINED');
  const hasUndetermined = questions.some((q) => q.status === 'UNDETERMINED');

  let final_status: 'PASS' | 'FATAL_FAIL' | 'FAIL' | 'UNDETERMINED';
  if (hasFatalFail) {
    final_status = 'FATAL_FAIL';
  } else if (hasFatalUndetermined) {
    final_status = 'UNDETERMINED';
  } else if (totalAwarded < denominator) {
    final_status = 'FAIL';
  } else {
    final_status = 'PASS';
  }

  return {
    scoring_version: version,
    rule_set_version: ruleSetVersion,
    questions,
    awarded: hasFatalFail ? 0 : totalAwarded,
    maximum: denominator,
    denominator,
    fatal_fail: hasFatalFail,
    has_undetermined: hasUndetermined,
    final_status,
  };
}

export function stage8CalculateScore(
  audit: StageAuditResult,
  scoringConfig?: {
    version?: string;
    rule_set_version?: string;
    weights?: Record<string, number>;
    fatal?: Record<string, boolean>;
  }
): StageScoreResult {
  // Single authoritative scoring engine contract (ARCHITECTURE §12, RULES D-07)
  const scoreObj = scoreAudit(audit, scoringConfig);

  const fatalReasons: string[] = [];
  for (const q of scoreObj.questions) {
    if (q.fatal && q.status === 'FAIL') {
      if (q.id === 'Q1') fatalReasons.push('Q1: Customer registered mobile number mismatch with trade record.');
      else if (q.id === 'Q2') {
        const q2Reason = (audit.q2 as any)?.reason || '';
        const q2Ev = (audit.q2 as any)?.evidence || '';
        if (q2Reason.includes('Spoken client code') || q2Ev.includes('Client Code / UCC') || q2Ev.includes('was not explicitly articulated')) {
          fatalReasons.push('Q2: Spoken client code confirmation missing or invalid in pre-order call.');
        } else {
          fatalReasons.push('Q2: Pre-order confirmation call initiated after trade execution (Regulatory timing violation).');
        }
      }
      else if (q.id === 'Q5') fatalReasons.push('Q5: Prohibited return or profit assurance was spoken by advisor.');
      else fatalReasons.push(`${q.id}: Fatal compliance violation.`);
    }
  }

  const undeterminedReasons: string[] = [];
  for (const q of scoreObj.questions) {
    if (q.status === 'UNDETERMINED') {
      undeterminedReasons.push(`${q.id}: Evaluation undetermined.`);
    }
  }

  const isFatal = scoreObj.fatal_fail;
  const denominator = scoreObj.denominator;
  const score = scoreObj.awarded;

  let disposition: 'COMPLIANT' | 'NON_COMPLIANT' | 'UNDETERMINED' = 'COMPLIANT';
  if (scoreObj.final_status === 'FATAL_FAIL' || scoreObj.final_status === 'FAIL') {
    disposition = 'NON_COMPLIANT';
  } else if (scoreObj.final_status === 'UNDETERMINED') {
    disposition = 'UNDETERMINED';
  }

  let audit_comment: string;
  if (isFatal) {
    audit_comment = `NON-COMPLIANT: Fatal compliance violation (${fatalReasons.join('; ')}). Score: ${score}/${denominator}.`;
  } else if (scoreObj.final_status === 'UNDETERMINED') {
    audit_comment = `UNDETERMINED: Compliance audit could not be definitively determined (${undeterminedReasons.join('; ')}). Score: ${score}/${denominator}.`;
  } else if (score < denominator) {
    const nonFatalDeductions = scoreObj.questions
      .filter((q) => !q.fatal && q.status === 'FAIL')
      .map((q) => q.id)
      .join(', ');
    audit_comment = `COMPLIANT WITH DEDUCTION: Pre-order confirmed with parameter discrepancy (${nonFatalDeductions}). Score: ${score}/${denominator}.`;
  } else {
    audit_comment = `COMPLIANT: Pre-order confirmation is strictly compliant with SEBI regulatory norms. Score: ${score}/${denominator}.`;
  }

  return {
    score,
    max_score: denominator,
    is_fatal: isFatal,
    fatal_reasons: fatalReasons,
    review_reasons: undeterminedReasons,
    audit_comment,
    disposition,
    scoreObject: scoreObj,
  };
}
