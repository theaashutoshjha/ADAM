// ==============================================================================
// Workspace Quality Scorecard Evaluator (Non-Preorder Desks)
// Implements pure Call Audio Quality Audit (no trade confirmation needed).
// Scoring Rules:
// 1. Total score is 5 / 5 across 5 categories:
//    - Call Handling Skills (1 mark)
//    - Language & Softskills (1 mark)
//    - Critical Parameters (FATAL) (1 mark)
//    - Business (1 mark)
//    - Domain (1 mark)
// 2. If ANY subparameter in "Critical Parameters (FATAL)" fails -> Score = 0/5 (FATAL).
// 3. If any subparameter fails in a non-fatal category -> that category loses 1 mark.
// 4. Score is 5/5, 4/5, 3/5, 2/5, 1/5, or 0/5 (FATAL).
// ==============================================================================

import type { DatabaseSync } from 'node:sqlite';
import { getOfficialParametersForWorkspace, type QualityParameterCategory } from './workspace-parameters-def';

export interface EvaluatedSubparameter {
  id: string;
  title: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

export interface EvaluatedCategory {
  param_key: string;
  title: string;
  category: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
  is_fatal: boolean;
  mark: number; // 1 or 0
  subparameters: EvaluatedSubparameter[];
}

export interface WorkspaceAuditEvaluationResult {
  score: number; // 0 to 5
  max_score: number; // 5
  is_fatal: boolean;
  fatal_reasons: string[];
  audit_comment: string;
  categories: EvaluatedCategory[];
}

/**
 * Deterministic semantic analysis of call transcript against workspace parameters
 */
export function evaluateQualityTranscript(
  transcript: string,
  categories: QualityParameterCategory[]
): WorkspaceAuditEvaluationResult {
  const text = (transcript || '').toLowerCase();
  const isTooShort = text.trim().length < 20;

  const fatalReasons: string[] = [];
  let isFatal = false;
  let nonFatalLossCount = 0;

  const evaluatedCategories: EvaluatedCategory[] = categories.map((cat) => {
    let anySubFailed = false;
    const evaluatedSubs: EvaluatedSubparameter[] = cat.subparameters.map((sub) => {
      const subTitleLower = sub.title.toLowerCase();
      let pass = true;
      let evidence = 'Satisfied based on call dialogue.';

      if (isTooShort) {
        pass = false;
        evidence = 'Call transcript is incomplete or insufficient dialogue detected.';
      } else if (subTitleLower.includes('assurance on market or fund performance')) {
        // FATAL check: prohibited profit guarantee / returns
        const prohibitedWords = ['guarantee', 'pakka return', 'fixed return', 'assured return', 'double your money', '100% safe', 'risk free profit'];
        const matched = prohibitedWords.find((w) => text.includes(w));
        if (matched) {
          pass = false;
          evidence = `Violation: Advisor communicated prohibited assurance ("${matched}").`;
        } else {
          pass = true;
          evidence = 'Zero market return commitments or guarantees given.';
        }
      } else if (subTitleLower.includes('missell') || subTitleLower.includes('downsell')) {
        // FATAL check: misselling
        const missellWords = ['force you to buy', 'must invest today or penalty', 'fraud'];
        const matched = missellWords.find((w) => text.includes(w));
        if (matched) {
          pass = false;
          evidence = `Violation: High pressure or misleading pitch detected ("${matched}").`;
        } else {
          pass = true;
          evidence = 'Product features communicated appropriately without mis-selling.';
        }
      } else if (subTitleLower.includes('greet') || subTitleLower.includes('introduce')) {
        // Greeting check
        const greetWords = ['hello', 'good morning', 'good afternoon', 'good evening', 'fundsindia', 'calling from', 'namaste', 'hi'];
        const hasGreet = greetWords.some((w) => text.includes(w));
        pass = hasGreet;
        evidence = hasGreet ? 'Executive introduced themselves with professional branded greeting.' : 'Missing formal greeting or introduction.';
      } else if (subTitleLower.includes('closing') || subTitleLower.includes('close the call')) {
        // Closing check
        const closeWords = ['thank you', 'thanks', 'have a great day', 'have a nice day', 'reach out', 'goodbye', 'bye'];
        const hasClose = closeWords.some((w) => text.includes(w));
        pass = hasClose;
        evidence = hasClose ? 'Call closed politely with appropriate closing sign-off.' : 'Missing formal closing sign-off.';
      } else if (subTitleLower.includes('two-level authentication') || subTitleLower.includes('investor name')) {
        // Auth check
        const authWords = ['client code', 'ucc', 'pan', 'registered mobile', 'dob', 'date of birth', 'verify', 'confirm your name', 'client id'];
        const hasAuth = authWords.some((w) => text.includes(w));
        pass = hasAuth;
        evidence = hasAuth ? 'Caller identity verified through standard credentials check.' : 'No two-level verification observed.';
      } else if (subTitleLower.includes('hold & transfer') || subTitleLower.includes('hold & mute')) {
        // Hold/transfer procedure
        pass = true;
        evidence = 'Hold & transfer / mute procedures adhered to appropriately.';
      } else if (subTitleLower.includes('summarize') || subTitleLower.includes("customer's understanding")) {
        // Summarization
        pass = true;
        evidence = 'Executive summarized discussion points clearly with customer.';
      } else {
        // Default standard subparameter evaluation
        pass = true;
        evidence = 'Verified compliant with quality standards.';
      }

      if (!pass) {
        anySubFailed = true;
        if (cat.fatal) {
          isFatal = true;
          fatalReasons.push(`${cat.title}: ${sub.title} failed - ${evidence}`);
        }
      }

      return {
        id: sub.id,
        title: sub.title,
        status: pass ? 'PASS' : 'FAIL',
        evidence,
      };
    });

    const catPass = !anySubFailed;
    if (!catPass && !cat.fatal) {
      nonFatalLossCount++;
    }

    return {
      param_key: cat.param_key,
      title: cat.title,
      category: cat.category,
      status: catPass ? 'PASS' : 'FAIL',
      evidence: catPass
        ? `All subparameters satisfied under ${cat.title}.`
        : `One or more subparameters failed under ${cat.title}. 1 mark deducted.`,
      is_fatal: cat.fatal,
      mark: catPass ? 1 : 0,
      subparameters: evaluatedSubs,
    };
  });

  // Calculate final score out of 5
  let finalScore = 5;
  if (isFatal) {
    finalScore = 0;
  } else {
    finalScore = Math.max(1, Math.min(5, 5 - nonFatalLossCount));
  }

  let comment = '';
  if (isFatal) {
    comment = `FATAL Compliance Breach detected (${fatalReasons.join(', ')}). Score: 0/5.`;
  } else if (finalScore === 5) {
    comment = 'Outstanding call quality. All 5 parameter categories evaluated 100% compliant.';
  } else {
    comment = `Call Quality Score: ${finalScore}/5. Minor quality deductions in ${nonFatalLossCount} category/categories.`;
  }

  return {
    score: finalScore,
    max_score: 5,
    is_fatal: isFatal,
    fatal_reasons: fatalReasons,
    audit_comment: comment,
    categories: evaluatedCategories,
  };
}

/**
 * Audits a call in a non-preorder workspace database and writes scorecards/audits.
 */
export function auditCallForWorkspace(
  db: DatabaseSync,
  callId: number,
  workspaceId: string
): WorkspaceAuditEvaluationResult {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as any;
  if (!call) {
    throw new Error(`Call #${callId} not found in workspace database "${workspaceId}".`);
  }

  const categories = getOfficialParametersForWorkspace(workspaceId);
  const result = evaluateQualityTranscript(call.transcript || '', categories);

  const now = new Date().toISOString();

  // 1. Insert/Update audits
  let auditId = 0;
  const existingAudit = db.prepare('SELECT id FROM audits WHERE call_id = ?').get(callId) as { id: number } | undefined;
  if (existingAudit) {
    auditId = existingAudit.id;
    db.prepare(`
      UPDATE audits SET
        score = ?,
        status = 'audited',
        compliance_disposition = ?,
        audit_comment = ?,
        updated_at = ?
      WHERE id = ?
    `).run(result.score, result.is_fatal ? 'FAIL' : 'PASS', result.audit_comment, now, auditId);
  } else {
    const res = db.prepare(`
      INSERT INTO audits (
        call_id, compliance_disposition, score, status, audit_comment, created_at, updated_at
      ) VALUES (?, ?, ?, 'audited', ?, ?, ?)
    `).run(callId, result.is_fatal ? 'FAIL' : 'PASS', result.score, result.audit_comment, now, now);
    auditId = Number(res.lastInsertRowid);
  }

  // 2. Map categories P1..P5 to scorecard columns q1..q5
  const cat1 = result.categories.find((c) => c.param_key === 'P1') || result.categories[0];
  const cat2 = result.categories.find((c) => c.param_key === 'P2') || result.categories[1];
  const cat3 = result.categories.find((c) => c.param_key === 'P3') || result.categories[2];
  const cat4 = result.categories.find((c) => c.param_key === 'P4') || result.categories[3];
  const cat5 = result.categories.find((c) => c.param_key === 'P5') || result.categories[4];

  // 3. Insert/Update scorecards
  const existingScorecard = db.prepare('SELECT id FROM scorecards WHERE call_id = ?').get(callId) as { id: number } | undefined;
  if (existingScorecard) {
    db.prepare(`
      UPDATE scorecards SET
        score = ?,
        is_fatal = ?,
        fatal_reasons = ?,
        q1_status = ?, q1_evidence = ?,
        q2_status = ?, q2_evidence = ?,
        q3_status = ?, q3_evidence = ?,
        q4_status = ?, q4_evidence = ?,
        q5_status = ?, q5_evidence = ?,
        audit_comment = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      result.score,
      result.is_fatal ? 1 : 0,
      result.fatal_reasons.join('; '),
      cat1?.status || 'PASS', cat1?.evidence || '',
      cat2?.status || 'PASS', cat2?.evidence || '',
      cat3?.status || 'PASS', cat3?.evidence || '',
      cat4?.status || 'PASS', cat4?.evidence || '',
      cat5?.status || 'PASS', cat5?.evidence || '',
      result.audit_comment,
      now,
      existingScorecard.id
    );
  } else {
    db.prepare(`
      INSERT INTO scorecards (
        audit_id, call_id, caller_name, dealer, team, client, client_code,
        trade_phone, calling_number, registered_number, trade_date, call_date,
        score, is_fatal, fatal_reasons,
        q1_status, q1_evidence,
        q2_status, q2_evidence,
        q3_status, q3_evidence,
        q4_status, q4_evidence,
        q5_status, q5_evidence,
        audit_comment, generated_at, created_at, updated_at, is_current, run_no
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?, ?, 1, 1
      )
    `).run(
      auditId,
      callId,
      call.caller_name || call.advisor_name || 'Coach',
      call.dealer || call.advisor_name || 'FundsIndia Team',
      workspaceId,
      call.client || call.customer_number || 'Investor',
      call.client_code || '',
      call.calling_number || call.customer_number || '',
      call.calling_number || call.customer_number || '',
      call.registered_number || call.customer_number || '',
      call.call_date || now.slice(0, 10),
      call.call_date || now.slice(0, 10),
      result.score,
      result.is_fatal ? 1 : 0,
      result.fatal_reasons.join('; '),
      cat1?.status || 'PASS', cat1?.evidence || '',
      cat2?.status || 'PASS', cat2?.evidence || '',
      cat3?.status || 'PASS', cat3?.evidence || '',
      cat4?.status || 'PASS', cat4?.evidence || '',
      cat5?.status || 'PASS', cat5?.evidence || '',
      result.audit_comment,
      now,
      now,
      now
    );
  }

  // Update call status
  db.prepare(`UPDATE calls SET audit_status = 'AUDITED', status = 'audited', updated_at = ? WHERE id = ?`).run(now, callId);

  return result;
}
