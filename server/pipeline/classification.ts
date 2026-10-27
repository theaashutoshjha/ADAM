// =============================================================
// Stage 4: CALL INTENT CLASSIFICATION (Authoritative Semantic Engine)
// Classifies call into:
// PRE_ORDER | REGULAR | SCRAP | REVIEW
//
// Core Mandates:
// 1. Scrap Call:
//    - All calls < 6s duration are SCRAP.
//    - Calls >= 6s duration are NOT SCRAP by duration alone (eligible for transcription).
//    - Silent, empty, or automated voicemail/carrier disconnects are SCRAP.
// 2. Pre-Order Call:
//    - The core question: Was an actionable order instruction given for immediate execution?
//    - DO NOT use trade existence as proof of PRE_ORDER.
//    - DO NOT classify based on words like BUY/SELL alone.
// 3. Regular Call:
//    - Market discussion, portfolio inquiry, advice without immediate order directive is REGULAR.
//    - Regular calls are safely finalized and NEVER audited.
// 4. Review Call:
//    - Ambiguous, disputable, or cut-off order intent is REVIEW.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type {
  ClassificationResult,
  ClassificationEvidence,
  TranscriptSegment,
  CallClassification,
} from './types';
import type { CallRecord } from '../../src/types';
import {
  detectScrapCall,
  detectHighRecallPreOrderCandidate,
  classifyCallIntent,
  classifyCallIntentWithAI,
  validateEvidenceInTranscript,
  type PreOrderClassificationResult,
} from '../classifier';
import {
  isIndianMarketHours,
  isCallWithinMarketWindow,
  normalizePhoneNumber,
  formatCleanClientCode,
  isStrictValidClientCode,
  matchSymbolInTranscript,
  matchPriceInTranscript,
  matchQuantityInTranscript,
  cleanAgentName,
  compareAdvisorNames,
  mentionsMarketPriceOrCMP,
  normalizeToIsoDate,
  repairMangledClientCodesInTranscript,
  ORDER_ACTION_REGEX,
} from '../normalizer';

export interface PreOrderTradeEvaluation {
  isCandidate: boolean;
  matchedTradeRecord: any | null;
  normCustomerNumber: string;
  reason: string;
}

/**
 * Deterministic Pre-Order Candidate Evaluator:
 * Stage 1: Call ID Matched (Audio filename = Column C)
 * Stage 2: Call Start Time within Indian Market Hours (09:15 - 15:40)
 * Stage 3: Customer Number (last 10 digits) == Trade Phone Number (last 10 digits) scoped by trade date
 * Stage 4: Optional Advisor validation
 */
export function evaluatePreOrderTradeCandidate(
  db: DatabaseSync,
  customerNumber?: string | null,
  callTime?: string | null,
  callDate?: string | null,
  advisorName?: string | null,
  transcript?: string | null,
  clientCode?: string | null
): PreOrderTradeEvaluation {
  const rawCustomer = customerNumber || '';
  const normCustomer = normalizePhoneNumber(rawCustomer);
  const cleanUcc = formatCleanClientCode(clientCode || '');

  // Also inspect repaired transcript for spoken client code
  let spokenUcc = '';
  const repairedTx = transcript ? repairMangledClientCodesInTranscript(transcript) : '';
  if (repairedTx) {
    const m = repairedTx.match(/\b([A-Z]{2,4}\d{4,6})\b/i);
    if (m) spokenUcc = formatCleanClientCode(m[1]);
  }
  const targetUcc = cleanUcc || spokenUcc;

  if ((!normCustomer || normCustomer.length !== 10) && !targetUcc) {
    return {
      isCandidate: false,
      matchedTradeRecord: null,
      normCustomerNumber: normCustomer || '',
      reason: 'Neither valid 10-digit customer phone nor client code available',
    };
  }

  try {
    let candidateTrades: any[] = [];
    if (normCustomer && normCustomer.length === 10 && targetUcc) {
      candidateTrades = db.prepare(`
        SELECT * FROM trades 
        WHERE client_number = ? OR phone_number = ? OR client = ? OR client_code = ?
           OR client_number LIKE ? OR phone_number LIKE ?
        ORDER BY id ASC
      `).all(normCustomer, normCustomer, targetUcc, targetUcc, `%${normCustomer}`, `%${normCustomer}`) as any[];
    } else if (normCustomer && normCustomer.length === 10) {
      candidateTrades = db.prepare(`
        SELECT * FROM trades 
        WHERE client_number = ? OR phone_number = ? OR client_number LIKE ? OR phone_number LIKE ?
        ORDER BY id ASC
      `).all(normCustomer, normCustomer, `%${normCustomer}`, `%${normCustomer}`) as any[];
    } else if (targetUcc) {
      candidateTrades = db.prepare(`
        SELECT * FROM trades 
        WHERE client = ? OR client_code = ?
        ORDER BY id ASC
      `).all(targetUcc, targetUcc) as any[];
    }

    if (candidateTrades.length === 0) {
      return {
        isCandidate: false,
        matchedTradeRecord: null,
        normCustomerNumber: normCustomer || (targetUcc ? targetUcc : ''),
        reason: 'Customer identity does not exist in trade data',
      };
    }

    const rawTime = callTime || '';
    if (rawTime && !isCallWithinMarketWindow(rawTime, 0, true)) {
      return {
        isCandidate: false,
        matchedTradeRecord: null,
        normCustomerNumber: normCustomer,
        reason: `Call time (${rawTime}) is outside Indian Market Hours (09:15 AM - 03:40 PM). Classified as normal call.`,
      };
    }

    const callDateIso = normalizeToIsoDate(callDate);
    const cleanAdvisor = cleanAgentName(advisorName || '');

    // Multi-Day Date Scoping: Match on exact trading day if call date is known
    const dateFilteredTrades = candidateTrades.filter((t) => {
      if (!callDateIso || !t.trade_date) return true;
      const tDateIso = normalizeToIsoDate(t.trade_date);
      return !tDateIso || tDateIso === callDateIso;
    });

    // If call has a specific date and no trades match that date, candidateTrades belong to other trading days
    const applicableTrades = (callDateIso && dateFilteredTrades.length > 0) ? dateFilteredTrades : (callDateIso ? [] : candidateTrades);

    if (applicableTrades.length === 0 && candidateTrades.length > 0) {
      return {
        isCandidate: false,
        matchedTradeRecord: null,
        normCustomerNumber: normCustomer || '',
        reason: `Trades found for client/phone but date (${candidateTrades[0]?.trade_date}) does not match call date (${callDateIso}).`,
      };
    }

    // Filter trades by advisor if advisor is specified
    let matchingAdvisorTrades = applicableTrades;
    if (cleanAdvisor) {
      const advMatches = applicableTrades.filter((t) => {
        const aAdv = cleanAgentName(t.advisor_name || t.dealer || '');
        return aAdv && compareAdvisorNames(cleanAdvisor, aAdv);
      });
      if (advMatches.length > 0) {
        matchingAdvisorTrades = advMatches;
      }
    }

    // Dialogue Intent Validation: If transcript is present, reject pure discussions, GST inquiries, or non-order calls
    if (transcript && transcript.length >= 15) {
      const activeTx = repairedTx || transcript;
      const hasOrderIntent = ORDER_ACTION_REGEX.test(activeTx);
      let hasSymbolMatch = false;
      for (const t of applicableTrades) {
        if (t.symbol && matchSymbolInTranscript(t.symbol, activeTx).matched) {
          hasSymbolMatch = true;
          break;
        }
      }
      const isPureInquiry = /\b(?:statement|ledger|contract\s*note|holding|portfolio|kyc|tax|pnl|password)\b/i.test(activeTx) && !hasOrderIntent;
      if (isPureInquiry || (!hasOrderIntent && !hasSymbolMatch)) {
        return {
          isCandidate: false,
          matchedTradeRecord: null,
          normCustomerNumber: normCustomer || (applicableTrades[0]?.phone_number || ''),
          reason: isPureInquiry ? 'Account/portfolio inquiry without order directive' : 'Call dialogue does not contain actionable order intent or matching scrip instruction',
        };
      }
    }

    // Select primary candidate trade:
    // If multiple candidate trades exist, score and select the best candidate based on transcript and temporal proximity
    let matchedTrade = matchingAdvisorTrades[0];
    if (matchingAdvisorTrades.length > 1) {
      let bestTrade = matchingAdvisorTrades[0];
      let bestScore = -Infinity;

      const normTx = (transcript || '').toUpperCase();
      const callSec = callTime ? (() => {
        const [ch, cm, cs] = callTime.split(':').map(Number);
        return !isNaN(ch) ? ch * 3600 + (cm || 0) * 60 + (cs || 0) : null;
      })() : null;

      for (const trade of matchingAdvisorTrades) {
        let score = 0;
        const tradeSymbol = (trade.symbol || '').toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
        const baseSymbol = tradeSymbol.replace(/\d{1,2}[A-Z]{3}\d{2,}.*$/, '').trim();

        // 1. Symbol match in transcript
        if (normTx) {
          const symMatch = matchSymbolInTranscript(tradeSymbol, normTx).matched || (baseSymbol ? matchSymbolInTranscript(baseSymbol, normTx).matched : false);
          if (symMatch) score += 100;

          // Price match
          if (trade.price && (normTx.includes(String(trade.price)) || mentionsMarketPriceOrCMP(normTx))) {
            score += 40;
          }
          // Quantity match
          if (trade.quantity && normTx.includes(String(Math.round(trade.quantity)))) {
            score += 30;
          }
        }

        // 2. Temporal proximity to call start
        if (callSec !== null && trade.trade_time) {
          const [th, tm, ts] = trade.trade_time.split(':').map(Number);
          if (!isNaN(th)) {
            const tradeSec = th * 3600 + (tm || 0) * 60 + (ts || 0);
            const deltaSec = tradeSec - callSec;
            if (deltaSec >= -60 && deltaSec <= 3600) {
              // Trade occurred during or within 1h after call start
              score += Math.max(10, 60 - Math.floor(Math.abs(deltaSec) / 60));
            } else if (deltaSec < -60) {
              // Trade happened before call start - penalize heavily
              score -= 100;
            } else {
              // More than 1h after call
              score -= 20;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestTrade = trade;
        }
      }
      matchedTrade = bestTrade;
    }

    const candidateClientCodes = Array.from(new Set(matchingAdvisorTrades.map((t) => formatCleanClientCode(t.client || t.client_code)).filter(Boolean)));
    const tradeUcc = candidateClientCodes[0] || formatCleanClientCode(matchedTrade.client || matchedTrade.client_code);
    return {
      isCandidate: true,
      matchedTradeRecord: matchedTrade,
      normCustomerNumber: normCustomer,
      reason: `Confirmed Pre-Order: Customer Number ${normCustomer} matches executed trade #${matchedTrade.id} (${matchedTrade.symbol || 'Stock'} Qty:${matchedTrade.quantity || 'Mkt'} Price:${matchedTrade.price || 'CMP'} Client:${tradeUcc}).`,
    };
  } catch (err: any) {
    return {
      isCandidate: false,
      matchedTradeRecord: null,
      normCustomerNumber: normCustomer,
      reason: `Trade lookup error: ${err?.message}`,
    };
  }
}

/**
 * Stage 4 Entry Point: Call Intent Classification
 */
export async function stage4ClassifyCall(
  db: DatabaseSync,
  callId: number,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<ClassificationResult> {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  const segments = db
    .prepare('SELECT * FROM call_segments WHERE call_id = ? ORDER BY start_time ASC')
    .all(callId) as unknown as TranscriptSegment[];

  const transcript = call.transcript || '';
  const durationSeconds = call.duration_seconds || 0;

  // -------------------------------------------------------------
  // STEP 0: MANDATORY SCRAP & VOICEMAIL DETECTION (Executed strictly BEFORE trade candidate checks)
  // Voicemails, carrier disconnects, silent calls, and unanswered "hello hello" loops CANNOT be pre-order calls!
  // -------------------------------------------------------------
  const scrapCheck = detectScrapCall(transcript, durationSeconds);
  if (scrapCheck) {
    const scrapResult: ClassificationResult = {
      classification: 'SCRAP',
      confidence: scrapCheck.confidence,
      evidence: [],
      reason: scrapCheck.reason,
      scrap_reason: scrapCheck.evidence,
      model: scrapCheck.model_used || 'scrap-filter',
    };
    persistClassification(db, callId, scrapResult);
    return scrapResult;
  }

  // -------------------------------------------------------------
  // STEP 1: DETERMINISTIC TRADE SELECTION (PRE-AI & PRE-TRANSCRIPTION)
  // Call ID Matched + Market Hours + Customer Phone in Trade Data on Date = PRE-ORDER CANDIDATE
  // -------------------------------------------------------------
  const rawCustomerNumber = (call as any).customer_number || call.calling_number || call.phone_number || (call as any).registered_number || '';
  const cleanCallAdvisor = cleanAgentName(call.caller_name || call.dealer || (call as any).advisor_name || (call as any).advisor || '');
  const rawClientCode = call.client_code || (call as any).client || '';

  const preOrderCheck = evaluatePreOrderTradeCandidate(
    db,
    rawCustomerNumber,
    call.call_time,
    call.call_date,
    cleanCallAdvisor,
    transcript,
    rawClientCode
  );

  const hasOrderKeywords = /\b(?:buy|sell|order|shares?|lot|lots|cmp|market\s*price|limit|execute|kharid|bech|booking|profit|placed|placing|target|stop\s*loss|sl)\b/i.test(transcript);
  const isPureInquiry = transcript.length > 0 &&
    /\b(?:statement|ledger|contract\s*note|holding|portfolio|kyc|tax|pnl|password)\b/i.test(transcript) &&
    !hasOrderKeywords;

  // Non-order chatter / technical support / wrong number calls must not be stamped PRE_ORDER
  const isNonOrderChatter = transcript.length > 25 &&
    /\b(?:workout\s*office|reject\s*id|registration\s*number|support\s*number|wrong\s*number|network\s*issue|call\s*later|baad\s*mein\s*(?:call|phone)|awaj\s*nahi\s*aa\s*rahi|voice\s*not\s*clear)\b/i.test(transcript) &&
    !/\b(?:buy|sell|place|placing|placed|shares?|lot|lots|target|stop\s*loss|sl|quantity|price)\b/i.test(transcript);

  if (preOrderCheck.isCandidate && preOrderCheck.matchedTradeRecord && !isPureInquiry && !isNonOrderChatter) {
    const matchedTrade = preOrderCheck.matchedTradeRecord;
    const normCustomerNumber = preOrderCheck.normCustomerNumber;
    const isShortCall = durationSeconds > 0 && durationSeconds < 6;
    const classificationReason = `${preOrderCheck.reason}${isShortCall ? ' [Short call <6s]' : ''}`;

    // Link customer identity details in DB
    try {
      const cleanTradePhone = normalizePhoneNumber(matchedTrade.phone_number || matchedTrade.client_number || '') || normCustomerNumber;
      const cleanTradeUcc = formatCleanClientCode(matchedTrade.client || matchedTrade.client_code);
      const cleanAdv = cleanAgentName(matchedTrade.advisor_name || matchedTrade.dealer || cleanCallAdvisor);
      db.prepare(`
        UPDATE calls SET 
          customer_number = ?,
          phone_number = ?,
          calling_number = ?,
          registered_number = ?,
          client_code = ?,
          client = ?,
          advisor_name = COALESCE(NULLIF(advisor_name, ''), ?),
          dealer = COALESCE(NULLIF(dealer, ''), ?)
        WHERE id = ?
      `).run(
        cleanTradePhone,
        cleanTradePhone,
        cleanTradePhone,
        cleanTradePhone,
        cleanTradeUcc,
        cleanTradeUcc,
        cleanAdv,
        matchedTrade.dealer || null,
        callId
      );
    } catch {}

    const result: ClassificationResult = {
      classification: 'PRE_ORDER',
      confidence: 1.0,
      evidence: [
        {
          segment_id: segments[0]?.segment_id || 'seg_deterministic_trade_match',
          start: segments[0]?.start_time || 0,
          end: segments[0]?.end_time || 0,
          speaker: 'ADVISOR',
          text: classificationReason,
        },
      ],
      reason: classificationReason,
      scrap_reason: isShortCall ? `Short duration pre-order call (${durationSeconds}s < 6s)` : undefined,
      model: 'deterministic-trade-phone-matcher',
    };

    persistClassification(db, callId, result);
    return result;
  }

  // -------------------------------------------------------------
  // STEP 2: NON-CANDIDATE HANDLING (SCRAP / MARKET HOURS / REGULAR)
  // -------------------------------------------------------------

  // 1.5 Indian Market Hours Filter (09:15 AM to 03:40 PM)
  const rawCallTime = call.call_time || '';
  if (rawCallTime && !isIndianMarketHours(rawCallTime)) {
    const regularResult: ClassificationResult = {
      classification: 'REGULAR',
      confidence: 1.0,
      evidence: [],
      reason: `Call time (${rawCallTime}) is outside Indian Market Hours (09:15 AM - 03:40 PM). Classified as normal call.`,
      model: 'market-hours-filter',
    };
    persistClassification(db, callId, regularResult);
    return regularResult;
  }


  // -------------------------------------------------------------
  // STEP 3: SEMANTIC INTENT CLASSIFICATION (AI / REGULAR FALLBACK)
  // -------------------------------------------------------------
  const activeGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  let aiResult: PreOrderClassificationResult;

  if (activeGeminiKey || groqApiKey) {
    try {
      aiResult = await classifyCallIntentWithAI(
        transcript,
        durationSeconds,
        groqApiKey,
        activeGeminiKey
      );
    } catch {
      aiResult = classifyCallIntent(transcript, durationSeconds);
    }
  } else {
    aiResult = classifyCallIntent(transcript, durationSeconds);
  }

  let stageClassification: CallClassification = 'REGULAR';
  if (aiResult.call_type === 'scrap') {
    stageClassification = 'SCRAP';
  } else if (aiResult.call_type === 'pre_order') {
    stageClassification = 'PRE_ORDER';
  } else {
    const highRecall = detectHighRecallPreOrderCandidate(transcript);
    if (highRecall.isCandidate) {
      stageClassification = 'PRE_ORDER';
      aiResult.evidence = highRecall.evidence;
      aiResult.reason = highRecall.reason;
    } else {
      stageClassification = 'REGULAR';
    }
  }

  // 4. Evidence Grounding for Non-Trade Calls: Associate with transcript segments
  const validEv = validateEvidenceInTranscript(aiResult.evidence, transcript);
  let matchedSegment = segments.find((s) =>
    s.text.toLowerCase().includes(validEv.normalizedEvidence.slice(0, 25).toLowerCase())
  );

  // If exact substring across single segment not found, find segment with order token (buy/sell or symbol)
  if (!matchedSegment && segments.length > 0) {
    matchedSegment = segments.find((s) => {
      const lower = s.text.toLowerCase();
      return lower.includes('buy') || lower.includes('sell') || lower.includes('order') ||
             (aiResult.evidence && lower.split(' ').some(w => w.length > 3 && aiResult.evidence.toLowerCase().includes(w)));
    }) || segments[0];
  }

  const evidenceList: ClassificationEvidence[] = [];
  let classificationReason = aiResult.reason;

  if (aiResult.evidence && (validEv.isValid || matchedSegment)) {
    evidenceList.push({
      segment_id: matchedSegment?.segment_id || 'seg_distributed',
      start: matchedSegment?.start_time || 0,
      end: matchedSegment?.end_time || 0,
      speaker: (aiResult.evidence_speaker === 'CLIENT' || aiResult.evidence_speaker === 'ADVISOR')
        ? aiResult.evidence_speaker
        : 'ADVISOR',
      text: aiResult.evidence,
    });
  } else if (stageClassification === 'PRE_ORDER' && !validEv.isValid && !matchedSegment) {
    // Only route to REVIEW if there are no segments and no text found at all
    stageClassification = 'REVIEW';
    classificationReason = 'Order intent evidence text could not be verified in audio segments; routed to compliance REVIEW.';
  }

  const result: ClassificationResult = {
    classification: stageClassification,
    confidence: stageClassification === 'REVIEW' ? 0.7 : aiResult.confidence,
    evidence: evidenceList,
    reason: classificationReason,
    model: aiResult.model_used || 'authoritative-intent-classifier',
  };

  persistClassification(db, callId, result);
  return result;
}

function persistClassification(
  db: DatabaseSync,
  callId: number,
  res: ClassificationResult
): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const callType = res.classification === 'PRE_ORDER' ? 'pre_order' : (res.classification === 'SCRAP' ? 'scrap' : 'regular');
  const primaryEvidence = res.evidence?.[0];

  try {
    db.prepare(`
      UPDATE calls SET
        classification = ?,
        call_type = ?,
        classification_confidence = ?,
        classification_evidence = ?,
        classification_reason = ?,
        preorder_confidence = ?,
        preorder_evidence = ?,
        preorder_speaker = ?,
        preorder_timestamp = ?,
        scrap_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      res.classification,
      callType,
      res.confidence,
      primaryEvidence?.text || res.reason,
      res.reason,
      res.confidence,
      primaryEvidence?.text || res.reason,
      primaryEvidence?.speaker || null,
      primaryEvidence ? `${primaryEvidence.start}s` : null,
      res.scrap_reason || null,
      now,
      callId
    );
    if (res.classification === 'SCRAP') {
      try {
        db.prepare(`
          UPDATE calls SET
            trade_match_status = NULL,
            matched_trade_id = NULL,
            status = 'scrap',
            audit_status = 'NOT_AUDITED',
            pipeline_stage = 'SCRAP'
          WHERE id = ?
        `).run(callId);
        db.prepare('DELETE FROM matches WHERE call_id = ?').run(callId);
        db.prepare('DELETE FROM scorecards WHERE call_id = ?').run(callId);
        db.prepare('DELETE FROM audits WHERE call_id = ?').run(callId);
      } catch {}
    } else if (res.classification === 'REGULAR') {
      try {
        db.prepare(`
          UPDATE calls SET
            trade_match_status = 'NO_ORDER',
            matched_trade_id = NULL,
            status = 'regular',
            audit_status = 'NOT_AUDITED',
            pipeline_stage = 'REGULAR'
          WHERE id = ?
        `).run(callId);
        db.prepare('DELETE FROM matches WHERE call_id = ?').run(callId);
        db.prepare('DELETE FROM scorecards WHERE call_id = ?').run(callId);
        db.prepare('DELETE FROM audits WHERE call_id = ?').run(callId);
      } catch {}
    }
  } catch (err: any) {
    if (err.message && err.message.includes('no such column')) {
      try {
        db.prepare(`UPDATE calls SET classification = ? WHERE id = ?`).run(res.classification, callId);
      } catch {}
    } else {
      throw err;
    }
  }
}
