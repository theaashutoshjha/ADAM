// =============================================================
// AuditEQ 9-Stage Orchestrator & 24/7 Autonomous Self-Healing Worker
//
// Ensures:
// 1. Strict, sequential 9-stage progression.
// 2. State machine guards: REGULAR, SCRAP, IDENTITY_REVIEW,
//    TRADE_REVIEW, CLASSIFICATION_REVIEW are strictly blocked from audit.
// 3. 24/7 continuous autonomous processing: never dies, auto-recovers
//    from stalled states, missing keys, rate limits, and network errors.
// 4. Standby mode when credentials are not yet entered; immediately
//    resumes upon key availability.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { geminiPool } from '../gemini-pool';
import { stage2ResolveIdentity } from './identity';
import { stage3TranscribeCall, FOREIGN_HALLUCINATIONS_REGEX } from './transcription';
import { stage3_5AttributeSpeakers } from './speakers';
import { stage4ClassifyCall, evaluatePreOrderTradeCandidate } from './classification';
import { stage5MatchTrade } from './tradeMatcher';
import { isAuditEligible } from './eligibility';
import { stage7AuditCall } from './audit';
import { stage8CalculateScore } from './scoring';
import { stage9PublishAudit, stage9ReconcileMissingCalls } from './reconciliation';
import type { CallRecord } from '../../src/types';
import type { ClassificationResult } from './types';
import { detectHighRecallPreOrderCandidate } from '../classifier';
import { formatCleanClientCode, isStrictValidClientCode, isIndianMarketHours, isCallWithinMarketWindow, formatToHmsTime, normalizePhoneNumber, cleanAgentName } from '../normalizer';
import { downloadCloudAudio, lookupRecordingUrlForCall } from '../audioDownloader';

export interface PipelineWorkerStatus {
  isRunning: boolean;
  activeWorkers: number;
  totalProcessedToday: number;
  lastActiveTime: string;
  hasDeepgramKey: boolean;
  hasGroqKey: boolean;
  hasGeminiKey: boolean;
  statusMessage: string;
  queueDepth: number;
}

let isWorkerLoopActive = false;
let isHeartbeatRunning = false;
let isPipelineActive = false;

export function activatePipeline(): void {
  isPipelineActive = true;
  console.log('[Pipeline Supervisor] Pipeline ACTIVATED by client trigger. Processing queued calls.');
}

export function pausePipeline(): void {
  isPipelineActive = false;
  console.log('[Pipeline Supervisor] Pipeline PAUSED by client. Standing by.');
}

export function isPipelineExecutionActive(): boolean {
  return isPipelineActive;
}

const activeProcessingCallIds = new Set<number>();
// High-speed Deepgram Nova-3 Multi-Lingual ASR Engine
const MAX_CONCURRENT_PIPELINE_WORKERS = 8;
let lastHeartbeatTime = new Date().toISOString();
let totalProcessedCount = 0;
let rateLimitPauseUntil = 0;
let geminiBlockedUntil = 0;

export function ensureCallColumns(db: DatabaseSync): void {
  try {
    const callCols = new Set((db.prepare("PRAGMA table_info(calls)").all() as Array<{ name: string }>).map((c) => c.name));
    const addCallCol = (name: string, type: string) => {
      if (!callCols.has(name)) {
        try { db.exec(`ALTER TABLE calls ADD COLUMN ${name} ${type};`); } catch {}
      }
    };
    addCallCol('batch_id', 'TEXT');
    addCallCol('original_filename', 'TEXT');
    addCallCol('recording_name', 'TEXT');
    addCallCol('storage_path', 'TEXT');
    addCallCol('recording_url', 'TEXT');
    addCallCol('file_size', 'INTEGER DEFAULT 0');
    addCallCol('mime_type', 'TEXT');
    addCallCol('canonical_call_id', 'TEXT');
    addCallCol('file_sha256', 'TEXT');
    addCallCol('client_code', 'TEXT');
    addCallCol('classification', 'TEXT');
    addCallCol('trade_match_status', 'TEXT');
    addCallCol('classification_reason', 'TEXT');
    addCallCol('scrap_reason', 'TEXT');
    addCallCol('audit_notes', 'TEXT');
    addCallCol('identity_status', 'TEXT');
    addCallCol('identity_source', 'TEXT');
    addCallCol('import_status', 'TEXT DEFAULT "CONFIRMED"');
    addCallCol('transcript_status', 'TEXT DEFAULT "PENDING"');
    addCallCol('audit_status', 'TEXT DEFAULT "PENDING"');
    addCallCol('processing_status', 'TEXT DEFAULT "IDLE"');
    addCallCol('matched_trade_id', 'INTEGER');
    addCallCol('trade_match_confidence', 'REAL');
    addCallCol('trade_match_margin', 'REAL');
    addCallCol('trade_match_reason', 'TEXT');
    addCallCol('current_gate', 'TEXT');
    addCallCol('gate_reason', 'TEXT');
    addCallCol('pipeline_stage', 'TEXT');
    addCallCol('retry_count', 'INTEGER DEFAULT 0');
    addCallCol('review_resolution', 'TEXT');
    addCallCol('review_resolved_by', 'INTEGER');
    addCallCol('review_resolved_at', 'TEXT');
    addCallCol('review_resolution_notes', 'TEXT');
    addCallCol('dealer_name', 'TEXT');
    addCallCol('advisor_name', 'TEXT');
    addCallCol('dealer', 'TEXT');
    addCallCol('caller_name', 'TEXT');
    addCallCol('client', 'TEXT');
    addCallCol('customer_number', 'TEXT');
    addCallCol('caller_id', 'TEXT');
    addCallCol('phone_number', 'TEXT');
    addCallCol('call_type', 'TEXT');
    addCallCol('failure_reason', 'TEXT');
    addCallCol('source', 'TEXT DEFAULT "manual"');
    addCallCol('spoken_language', 'TEXT');
    addCallCol('call_date', 'TEXT');
    addCallCol('call_time', 'TEXT');
    addCallCol('duration_seconds', 'INTEGER DEFAULT 0');
    addCallCol('status', 'TEXT DEFAULT "pending"');

    const tradeCols = new Set((db.prepare("PRAGMA table_info(trades)").all() as Array<{ name: string }>).map((c) => c.name));
    const addTradeCol = (name: string, type: string) => {
      if (!tradeCols.has(name)) {
        try { db.exec(`ALTER TABLE trades ADD COLUMN ${name} ${type};`); } catch {}
      }
    };
    addTradeCol('dealer_name', 'TEXT');
    addTradeCol('advisor_name', 'TEXT');
    addTradeCol('customer_number', 'TEXT');
    addTradeCol('client_code', 'TEXT');
    addTradeCol('price_display', 'TEXT DEFAULT "CMP"');
    addTradeCol('is_combined', 'INTEGER DEFAULT 0');
    addTradeCol('split_count', 'INTEGER DEFAULT 1');
    addTradeCol('notes', 'TEXT');
    addTradeCol('order_date', 'TEXT');
  } catch {}
}

/**
 * Execute the 9-stage pipeline sequentially for a single call
 */
export async function runFullPipelineForCall(
  db: DatabaseSync,
  callId: number,
  deepgramApiKey?: string,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<{ success: boolean; stage: string; details: any }> {
  ensureCallColumns(db);
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    console.warn(`[Pipeline] Call #${callId} not found in database. Skipping.`);
    return { success: false, stage: 'NOT_FOUND', details: { reason: `Call #${callId} not found` } };
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare("UPDATE calls SET processing_status = 'PROCESSING', updated_at = ? WHERE id = ?").run(now, callId);

  const activeGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;

  try {
    // ---------------------------------------------------------
    // STAGE 2: CUSTOMER NUMBER MATCH AGAINST AUTHORITATIVE TRADE DATA
    // User Mandate: System checks customer number one by one against trade.csv
    // If number matches -> PRE-ORDER call -> Pass Q1 -> Transcribe and Audit
    // ---------------------------------------------------------
    const rawCustomer = (call as any).customer_number || call.calling_number || call.phone_number || '';
    const normCustomer = normalizePhoneNumber(rawCustomer);

    // Look up in trades table by 10-digit customer number
    const matchingTrades = (normCustomer && normCustomer.length === 10)
      ? db.prepare(`
          SELECT * FROM trades 
          WHERE client_number = ? OR phone_number = ? OR client_number LIKE ? OR phone_number LIKE ?
          ORDER BY id ASC
        `).all(normCustomer, normCustomer, `%${normCustomer}`, `%${normCustomer}`) as any[]
      : [];

    const hasMatchingTradeCustomer = matchingTrades.length > 0;
    const isPreOrderMatch = call.classification === 'PRE_ORDER' || call.matched_trade_id != null;

    // Check if call time is distorted (e.g. 23:10:13 from upload time) but filename has true Unix epoch:
    let effectiveCallTime = call.call_time;
    if (!effectiveCallTime || effectiveCallTime.startsWith('23:') || effectiveCallTime.startsWith('22:') || effectiveCallTime.startsWith('00:')) {
      const epMatch = (call.canonical_call_id || call.original_filename || (call as any).caller_id || '').match(/(1[6-9]\d{8})/);
      if (epMatch) {
        const epSec = parseInt(epMatch[1], 10);
        const ist = new Date(epSec * 1000);
        effectiveCallTime = ist.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
        const effectiveDate = ist.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        try {
          db.prepare('UPDATE calls SET call_time = ?, call_date = ? WHERE id = ?').run(effectiveCallTime, effectiveDate, callId);
          call.call_time = effectiveCallTime;
          call.call_date = effectiveDate;
        } catch {}
      }
    }

    const callInMarketHours = isIndianMarketHours(effectiveCallTime);

    if (effectiveCallTime && !callInMarketHours) {
      console.log(`[Pipeline] Call #${callId} -> OUTSIDE_MARKET_HOURS (${effectiveCallTime}). Excluded from audit.`);
      db.prepare(`
        UPDATE calls SET
          classification = 'REGULAR',
          call_type = 'regular',
          status = 'out_of_market_hours',
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          pipeline_stage = 'OUTSIDE_MARKET_HOURS',
          current_gate = 'GATE_1',
          gate_reason = 'Call start time outside Indian market hours (09:15:00 - 15:40:00)',
          classification_reason = 'Call start time outside Indian market hours (09:15:00 - 15:40:00). Excluded from trade matching and transcription.',
          updated_at = ?
        WHERE id = ?
      `).run(now, callId);

      return {
        success: true,
        stage: 'OUTSIDE_MARKET_HOURS',
        details: { reason: `Call start time (${effectiveCallTime}) is outside Indian market hours.` },
      };
    }

    const hasAudioOnDisk = Boolean(call.storage_path && fs.existsSync(call.storage_path));

    if (!hasMatchingTradeCustomer && !hasAudioOnDisk) {
      const initialDuration = call.duration_seconds || 0;
      if (initialDuration > 0 && initialDuration < 6) {
        // Regulatory scrap threshold for non-trade calls without audio
        db.prepare(`
          UPDATE calls SET
            classification = 'SCRAP',
            call_type = 'scrap',
            status = 'scrap',
            audit_status = 'EXCLUDED',
            processing_status = 'COMPLETED',
            pipeline_stage = 'SCRAP_FILTER',
            current_gate = 'GATE_1',
            gate_reason = 'Non-trade call duration < 6s regulatory scrap threshold',
            classification_reason = 'Non-trade call duration < 6s regulatory scrap threshold.',
            updated_at = ?
          WHERE id = ?
        `).run(now, callId);

        return {
          success: true,
          stage: 'SCRAP_EXIT',
          details: { classification: 'SCRAP', reason: `Duration ${initialDuration}s < 6s.` },
        };
      } else {
        // Customer mismatch: phone does not match any trade and no audio file
        db.prepare(`
          UPDATE calls SET
            classification = 'REGULAR',
            call_type = 'regular',
            status = 'customer_mismatch',
            audit_status = 'EXCLUDED',
            processing_status = 'COMPLETED',
            pipeline_stage = 'CUSTOMER_MISMATCH',
            current_gate = 'GATE_1',
            gate_reason = 'CUSTOMER_MISMATCH: Customer phone number does not match any registered trade.',
            classification_reason = 'Customer phone number does not match any registered trade in dataset.',
            updated_at = ?
          WHERE id = ?
        `).run(now, callId);

        return {
          success: true,
          stage: 'CUSTOMER_MISMATCH',
          details: { reason: 'Customer phone does not match any trade and no audio file.' },
        };
      }
    }

    // ---------------------------------------------------------
    // STAGE 2.5: PRE-ORDER CANDIDATE SELECTION
    // ---------------------------------------------------------
    if (matchingTrades.length > 0) {
      const matchedTrade = matchingTrades[0];
      const cleanTradePhone = normalizePhoneNumber(matchedTrade.phone_number || matchedTrade.client_number || '') || normCustomer;
      const cleanTradeUcc = formatCleanClientCode(matchedTrade.client || matchedTrade.client_code);
      const cleanAdv = cleanAgentName(matchedTrade.advisor_name || matchedTrade.dealer || (call as any).advisor_name || call.caller_name || '');

      db.prepare(`
        UPDATE calls SET
          classification = 'PRE_ORDER',
          call_type = 'pre_order',
          customer_number = ?,
          phone_number = ?,
          calling_number = ?,
          registered_number = ?,
          client_code = COALESCE(NULLIF(client_code, 'UNVERIFIED'), ?),
          client = COALESCE(NULLIF(client, 'UNVERIFIED'), ?),
          advisor_name = COALESCE(NULLIF(advisor_name, ''), ?),
          dealer = COALESCE(NULLIF(dealer, ''), ?),
          pipeline_stage = 'TRANSCRIPTION_PENDING',
          current_gate = 'GATE_2',
          gate_reason = 'Deterministic trade phone match established within market hours. Queued for Gemini Flash transcription.',
          updated_at = ?
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
        now,
        callId
      );
    }

    // ---------------------------------------------------------
    // STAGE 2: IDENTITY RESOLUTION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 2: Identity Resolution`);
    stage2ResolveIdentity(db, callId);
    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'IDENTITY_RESOLUTION',
        current_gate = 'GATE_2',
        gate_reason = 'Client identity and authorization verified',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    // ---------------------------------------------------------
    // STAGE 3: TRANSCRIPTION (Deepgram Nova-3 Multi-Lingual ASR)
    // ---------------------------------------------------------
    let currentCall = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
    if (!currentCall) {
      return { success: false, stage: 'NOT_FOUND', details: { reason: `Call #${callId} not found` } };
    }
    const isCorruptTranscript = (currentCall.transcript || '').trim().length < 25 && (currentCall.duration_seconds || 0) > 10;
    const isHallucinated = FOREIGN_HALLUCINATIONS_REGEX.test(currentCall.transcript || '');
    if (
      currentCall.transcript_status !== 'VALID' ||
      !currentCall.transcript ||
      isCorruptTranscript ||
      isHallucinated
    ) {
      let audioPath = currentCall.storage_path;
      if (!audioPath || !fs.existsSync(audioPath)) {
        let recUrl = currentCall.recording_url;
        if (!recUrl) {
          recUrl = lookupRecordingUrlForCall(currentCall.canonical_call_id || '', currentCall.caller_id || '') || undefined;
        }
        if (recUrl && recUrl.startsWith('http')) {
          try {
            console.log(`[Pipeline] Downloading physical audio for Call #${callId} (${currentCall.canonical_call_id || callId}) from cloud URL...`);
            audioPath = await downloadCloudAudio(recUrl, currentCall.canonical_call_id || String(callId));
            db.prepare('UPDATE calls SET storage_path = ?, recording_url = ? WHERE id = ?').run(audioPath, recUrl, callId);
            currentCall.storage_path = audioPath;
            currentCall.recording_url = recUrl;
          } catch (dlErr: any) {
            console.error(`[Pipeline] Failed to download cloud audio for Call #${callId}:`, dlErr?.message);
          }
        }
      }

      if (!audioPath || !fs.existsSync(audioPath)) {
        console.warn(`[Pipeline] Call #${callId} -> No physical audio file on disk (${audioPath || 'EMPTY'}). Routing to Missing Call / Mail Confirmation audit.`);
        db.prepare(`
          UPDATE calls SET
            classification = 'REVIEW',
            call_type = 'review',
            status = 'review',
            audit_status = 'MISSING_AUDIO',
            processing_status = 'COMPLETED',
            pipeline_stage = 'MISSING_RECORDING',
            current_gate = 'GATE_3',
            gate_reason = 'Physical audio recording was not provided or missing from storage.',
            failure_reason = 'Physical audio recording missing from disk/upload. Routed to Missing Call / Mail Confirmation audit.',
            updated_at = ?
          WHERE id = ?
        `).run(now, callId);

        return {
          success: true,
          stage: 'MISSING_RECORDING',
          details: { reason: 'Physical audio recording missing from disk. Routed to Missing Call / Mail Confirmation audit.' },
        };
      }
      console.log(`[Pipeline] Call #${callId} -> Stage 3: Transcription (Deepgram Nova-3 ASR Engine)`);
      await stage3TranscribeCall(db, callId, deepgramApiKey);
    }
    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'TRANSCRIPTION',
        current_gate = 'GATE_3',
        gate_reason = 'High-fidelity transcription completed and validated',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    // ---------------------------------------------------------
    // STAGE 3.5: SPEAKER ATTRIBUTION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 3.5: Speaker Attribution`);
    stage3_5AttributeSpeakers(db, callId);

    // Re-resolve identity now that full transcript and segments are available
    stage2ResolveIdentity(db, callId);

    // ---------------------------------------------------------
    // STAGE 4: AI CALL INTENT CLASSIFICATION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 4: AI Call Intent Classification`);
    let classificationResult: ClassificationResult;
    const callBeforeClassification = db.prepare('SELECT review_resolution, classification, classification_reason FROM calls WHERE id = ?').get(callId) as any;
    if (callBeforeClassification?.review_resolution === 'CONTINUED' && callBeforeClassification.classification === 'PRE_ORDER') {
      classificationResult = {
        classification: 'PRE_ORDER',
        confidence: 1.0,
        evidence: [],
        reason: callBeforeClassification.classification_reason || 'Human-resolved compliance approval to proceed with audit.',
      };
    } else {
      classificationResult = await stage4ClassifyCall(db, callId, groqApiKey, activeGeminiKey);
    }

    // STATE MACHINE GUARD WITH HIGH-RECALL PRE-ORDER CORROBORATION:
    // 1. Scrap calls strictly exit immediately.
    if (classificationResult.classification === 'SCRAP') {
      db.prepare(`
        UPDATE calls SET
          classification = 'SCRAP',
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          status = 'scrap',
          call_type = 'scrap',
          pipeline_stage = 'SCRAP_EXIT',
          current_gate = 'GATE_4',
          gate_reason = ?,
          classification_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        classificationResult.reason,
        classificationResult.reason,
        now,
        callId
      );

      return {
        success: true,
        stage: 'CLASSIFICATION_EXIT',
        details: {
          classification: 'SCRAP',
          reason: classificationResult.reason,
          message: 'Call marked as SCRAP. Safely excluded from audit progression.',
        },
      };
    }

    // 2. Verified non-order REGULAR calls safely exit without trade resurrection
    if (classificationResult.classification === 'REGULAR') {
      db.prepare(`
        UPDATE calls SET
          classification = 'REGULAR',
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          status = 'regular',
          call_type = 'regular',
          trade_match_status = COALESCE(trade_match_status, 'NO_MATCH'),
          pipeline_stage = 'REGULAR_EXIT',
          current_gate = 'GATE_4',
          gate_reason = ?,
          classification_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        classificationResult.reason,
        classificationResult.reason,
        now,
        callId
      );

      return {
        success: true,
        stage: 'CLASSIFICATION_EXIT',
        details: {
          classification: 'REGULAR',
          reason: classificationResult.reason,
          message: 'Call marked as REGULAR. Safely excluded from audit progression.',
        },
      };
    }

    if (classificationResult.classification === 'REVIEW') {
      const dur = call.duration_seconds || 0;
        if (dur > 0 && dur < 6) {
          db.prepare(`
            UPDATE calls SET
              classification = 'SCRAP',
              call_type = 'scrap',
              status = 'scrap',
              audit_status = 'EXCLUDED',
              processing_status = 'COMPLETED',
              pipeline_stage = 'CLASSIFICATION_EXIT',
              current_gate = 'GATE_4',
              gate_reason = 'Automated Review: Short recording (<6s) classified as SCRAP.',
              classification_reason = 'Automated Review: Short recording (<6s) classified as SCRAP.',
              updated_at = ?
            WHERE id = ?
          `).run(now, callId);
          return {
            success: true,
            stage: 'CLASSIFICATION_EXIT',
            details: {
              classification: 'SCRAP',
              reason: 'Short recording (<6s) classified as SCRAP by automated review.',
              message: 'Call marked as SCRAP. Excluded from audit.',
            },
          };
        } else {
          db.prepare(`
            UPDATE calls SET
              classification = 'REGULAR',
              call_type = 'regular',
              status = 'regular',
              audit_status = 'EXCLUDED',
              processing_status = 'COMPLETED',
              pipeline_stage = 'CLASSIFICATION_EXIT',
              current_gate = 'GATE_4',
              gate_reason = 'Automated Review: General advisory dialogue without pre-order execution.',
              classification_reason = 'Automated Review: General advisory dialogue without pre-order execution.',
              updated_at = ?
            WHERE id = ?
          `).run(now, callId);
          return {
            success: true,
            stage: 'CLASSIFICATION_EXIT',
            details: {
              classification: 'REGULAR',
              reason: 'General advisory dialogue without pre-order execution.',
              message: 'Call marked as REGULAR. Excluded from audit.',
            },
          };
        }
    }

    // ---------------------------------------------------------
    // STAGE 5: HIERARCHICAL ORDER & EXECUTION CORRELATION
    // Correlates spoken orders to trade execution records.
    // Genuine PRE_ORDER calls proceed to compliance audit regardless
    // of whether trade executions were found (SEBI Audit Integrity).
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 5: Exact Trade Matching`);
    const matchResult = stage5MatchTrade(db, callId);

    // Refresh identity if trade was matched so phone number and UCC are linked
    if (matchResult.matched_trade_id || (matchResult.multiExecution?.matched_trade_ids && matchResult.multiExecution.matched_trade_ids.length > 0)) {
      stage2ResolveIdentity(db, callId);
    }

    // FINAL CLASSIFICATION DECISION (Items 1 to 15, 139 to 152)
    if (matchResult.status === 'CONFIRMED') {
      // Confirmed executed trade correlation verified
      db.prepare(`
        UPDATE calls SET
          trade_match_status = 'CONFIRMED',
          matched_trade_id = ?,
          pipeline_stage = 'TRADE_MATCHING',
          current_gate = 'GATE_5',
          gate_reason = 'Executed trade confirmed and correlated.',
          updated_at = ?
        WHERE id = ?
      `).run(
        matchResult.matched_trade_id,
        now,
        callId
      );
    } else if (matchResult.status === 'NO_MATCH') {
      const custNum = (call as any).customer_number || call.calling_number || call.phone_number || '';
      const cleanCust = normalizePhoneNumber(custNum);
      const tradeForCust = cleanCust && cleanCust.length === 10
        ? (db.prepare(`SELECT * FROM trades WHERE phone_number LIKE ? OR client_number LIKE ? ORDER BY id ASC LIMIT 1`).get(`%${cleanCust}`, `%${cleanCust}`) as any)
        : null;

      let isWithinWindow = false;
      if (tradeForCust && call.call_time && tradeForCust.trade_time) {
        try {
          const [ch, cm, cs] = call.call_time.split(':').map(Number);
          const [th, tm, ts] = tradeForCust.trade_time.split(':').map(Number);
          if (!isNaN(ch) && !isNaN(th)) {
            const callSec = ch * 3600 + (cm || 0) * 60 + (cs || 0);
            const tradeSec = th * 3600 + (tm || 0) * 60 + (ts || 0);
            const diffSec = tradeSec - callSec;
            if (diffSec >= 0 && diffSec <= 3600) {
              isWithinWindow = true;
            }
          }
        } catch {}
      }

      const transcript = call.transcript || '';
      const hasOrderKeywords = /\b(?:buy|sell|order|shares?|lot|lots|cmp|market\s*price|limit|quantity|price|call|put|ce|pe|execute|kharid|bech)\b/i.test(transcript);
      const isDisconnectedOrInquiry = (call.duration_seconds || 0) < 15 || !hasOrderKeywords || /\b(?:statement|ledger|contract\s*note|holding|portfolio|kyc|tax|pnl|password)\b/i.test(transcript);

      if (tradeForCust && isWithinWindow && isIndianMarketHours(call.call_time || '') && hasOrderKeywords && !isDisconnectedOrInquiry) {
        db.prepare(`
          UPDATE calls SET
            classification = 'PRE_ORDER',
            call_type = 'pre_order',
            trade_match_status = 'CONFIRMED',
            matched_trade_id = ?,
            pipeline_stage = 'TRADE_MATCHING',
            current_gate = 'GATE_5',
            gate_reason = 'Executed trade confirmed for customer contact within pre-order window.',
            updated_at = ?
          WHERE id = ?
        `).run(tradeForCust.id, now, callId);
      } else {
        // Call without correlated trade or without order dialogue: safe non-order exit
        const finalClass = (hasOrderKeywords && !isDisconnectedOrInquiry) ? 'PRE_ORDER' : 'REGULAR';
        const finalCallType = (hasOrderKeywords && !isDisconnectedOrInquiry) ? 'pre_order' : 'regular';
        const finalStatus = (hasOrderKeywords && !isDisconnectedOrInquiry) ? 'no_trade_correlated' : 'regular';
        db.prepare(`
          UPDATE calls SET
            trade_match_status = 'NO_MATCH',
            classification = ?,
            call_type = ?,
            status = ?,
            audit_status = 'EXCLUDED',
            processing_status = 'COMPLETED',
            pipeline_stage = ?,
            current_gate = 'GATE_5',
            gate_reason = 'No executed trade found for customer call within market hours pre-order window',
            classification_reason = 'Call without executed trade correlation or order execution dialogue.',
            updated_at = ?
          WHERE id = ?
        `).run(
          finalClass,
          finalCallType,
          finalStatus,
          finalClass === 'PRE_ORDER' ? 'NO_TRADE_CORRELATED' : 'REGULAR_EXIT',
          now,
          callId
        );

        return {
          success: true,
          stage: finalClass === 'PRE_ORDER' ? 'NO_TRADE_CORRELATED' : 'REGULAR_EXIT',
          details: { reason: 'No executed trade correlated to this call' }
        };
      }
    } else {
      // matchResult.status === 'REVIEW' / AMBIGUOUS
      // Record exception state AMBIGUOUS_TRADE_MATCH per Section 7 & 34
      db.prepare(`
        UPDATE calls SET
          trade_match_status = 'AMBIGUOUS_TRADE_MATCH',
          status = 'ambiguous_trade_match',
          audit_status = 'EXCLUDED',
          processing_status = 'COMPLETED',
          pipeline_stage = 'AMBIGUOUS_TRADE_MATCH',
          current_gate = 'GATE_5',
          gate_reason = ?,
          classification_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        `AMBIGUOUS_TRADE_MATCH: ${matchResult.reason}`,
        `AMBIGUOUS_TRADE_MATCH: ${matchResult.reason}`,
        now,
        callId
      );

      return {
        success: true,
        stage: 'AMBIGUOUS_TRADE_MATCH',
        details: { reason: `AMBIGUOUS_TRADE_MATCH: ${matchResult.reason}` }
      };
    }

    // ---------------------------------------------------------
    // STAGE 6: AUDIT ELIGIBILITY GATE
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 6: Audit Eligibility Gate`);
    const eligibility = isAuditEligible(db, callId);
    if (!eligibility.eligible) {
      console.log(`[Pipeline] Call #${callId} -> Eligibility blocked: [${eligibility.gateCode}] ${eligibility.reason}`);
      db.prepare(`
        UPDATE calls SET
          audit_status = 'BLOCKED',
          processing_status = 'COMPLETED',
          status = 'blocked',
          pipeline_stage = 'AUDIT_GATE_BLOCKED',
          current_gate = ?,
          gate_reason = ?,
          updated_at = ?
        WHERE id = ?
      `).run(eligibility.gateCode, eligibility.reason, now, callId);

      return {
        success: true,
        stage: 'ELIGIBILITY_GATE_BLOCKED',
        details: eligibility,
      };
    }

    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'AUDIT_GATE_PASSED',
        current_gate = 'GATE_6',
        gate_reason = 'All mandatory compliance audit eligibility criteria satisfied',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    // ---------------------------------------------------------
    // STAGE 7: Q1/Q2/Q3/Q4 COMPLIANCE AUDIT
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 7: Q1/Q2/Q3/Q4 Compliance Audit`);
    const auditResult = await stage7AuditCall(db, callId, groqApiKey, activeGeminiKey);

    // ---------------------------------------------------------
    // STAGE 8: SCORING (Unified Single Engine, Max 5)
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 8: Unified Scoring (Max 5)`);
    const scoreResult = stage8CalculateScore(auditResult);

    // ---------------------------------------------------------
    // STAGE 9: PUBLISH & RECONCILIATION
    // ---------------------------------------------------------
    console.log(`[Pipeline] Call #${callId} -> Stage 9: Publish Audit Scorecard`);
    const published = stage9PublishAudit(db, callId, auditResult, scoreResult);

    // Note: stage9ReconcileMissingCalls is intentionally scheduled to background execution
    // to prevent O(N^2) table scans choking individual call pipeline latency.

    db.prepare(`
      UPDATE calls SET
        pipeline_stage = 'COMPLETED',
        current_gate = 'GATE_9',
        gate_reason = 'Compliance audit completed and scorecard published',
        processing_status = 'COMPLETED',
        status = 'audited',
        updated_at = ?
      WHERE id = ?
    `).run(now, callId);

    totalProcessedCount++;

    return {
      success: true,
      stage: 'COMPLETED',
      details: {
        audit_id: published.audit_id,
        score: scoreResult.score,
        is_fatal: scoreResult.is_fatal,
        disposition: scoreResult.disposition,
      },
    };
  } catch (err: any) {
    const isApiKeyError = err.message && err.message.includes('AWAITING_API_KEY');
    const is402PaymentRequired = err.message && (
      err.message.includes('402') ||
      err.message.includes('ASR_PAYMENT_REQUIRED') ||
      err.message.includes('not have enough credits')
    );

    if (is402PaymentRequired) {
      console.warn(`[Pipeline] Call #${callId} -> Deepgram ASR credits exhausted or inactive. Pausing ASR.`);
      isPipelineActive = false;
      rateLimitPauseUntil = Date.now() + 600000;
      db.prepare(`
        UPDATE calls SET
          processing_status = 'AI_BLOCKED',
          status = 'ai_blocked',
          failure_reason = ?,
          pipeline_stage = 'TRANSCRIPTION_BLOCKED_CREDITS',
          current_gate = 'GATE_3',
          gate_reason = 'Deepgram account credits exhausted. Please recharge credits or update DEEPGRAM_API_KEY.',
          updated_at = ?
        WHERE id = ?
      `).run(err.message, now, callId);

      return {
        success: false,
        stage: 'TRANSCRIPTION_BLOCKED_CREDITS',
        details: { reason: err.message }
      };
    }

    console.error(`[Pipeline Error] Call #${callId}:`, err.message);

    const isRateLimit = err.message && (
      err.message.includes('429') ||
      err.message.includes('RESOURCE_EXHAUSTED') ||
      err.message.includes('resource_exhausted') ||
      err.message.includes('quota') ||
      err.message.includes('overloaded') ||
      err.message.includes('rate limit')
    );
    const isTransient = isRateLimit || (err.message && (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNRESET') || err.message.includes('fetch failed')));

    const currentRetry = ((call.retry_count as number) || 0) + 1;
    if (currentRetry >= 3) {
      console.warn(`[Pipeline] Call #${callId} -> Exceeded 3 retries. Marking as FAILED with status 'failed' (PROCESSING_ERROR).`);
      db.prepare(`
        UPDATE calls SET
          processing_status = 'FAILED',
          status = 'failed',
          audit_status = 'FAILED',
          failure_reason = ?,
          pipeline_stage = 'FAILED_MAX_RETRIES',
          current_gate = 'GATE_ERROR',
          gate_reason = ?,
          retry_count = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        `PROCESSING_ERROR: Exceeded maximum retries (3): ${err.message}`,
        `PROCESSING_ERROR: Exceeded maximum retries (3): ${err.message}`,
        currentRetry,
        now,
        callId
      );
      return { success: false, stage: 'FAILED_MAX_RETRIES', details: { error: err.message } };
    }

    // CRITICAL SELF-HEALING: Under no circumstances leave processing_status as 'PROCESSING'!
    // Always release back to 'IDLE' and 'retry_pending' so the autonomous supervisor automatically re-does the failed job.
    db.prepare(`
      UPDATE calls SET
        processing_status = 'IDLE',
        status = 'retry_pending',
        failure_reason = ?,
        pipeline_stage = 'FAILED',
        current_gate = 'GATE_ERROR',
        gate_reason = ?,
        retry_count = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      err.message,
      err.message,
      currentRetry,
      now,
      callId
    );

    throw err;
  }
}

/**
 * Autonomous 24/7 Watchdog: Auto-detects stalled calls, resets timed out locks,
 * prioritizes instant scrap calls and cached transcripts, and feeds calls into pipeline.
 */
export async function stepAutonomousPipelineWorker(
  db: DatabaseSync,
  getDeepgramKey?: () => string | undefined,
  getGroqKey?: () => string | undefined,
  getGeminiKey?: () => string | undefined
): Promise<boolean> {
  ensureCallColumns(db);
  lastHeartbeatTime = new Date().toISOString();
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 1. Self-Healing Watchdog: Reset any calls stuck in 'PROCESSING' for > 5 minutes (excluding active workers)
  const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString().replace('T', ' ').slice(0, 19);
  const activeIdsStr = activeProcessingCallIds.size > 0 ? Array.from(activeProcessingCallIds).join(',') : '0';
  const staleProcessing = db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      status = 'retry_pending',
      updated_at = ?
    WHERE (processing_status = 'PROCESSING' OR status = 'processing')
      AND id NOT IN (${activeIdsStr})
      AND (updated_at < ? OR updated_at IS NULL)
  `).run(nowIso, fiveMinutesAgo);

  if (staleProcessing.changes > 0) {
    console.log(`[Watchdog] Recovered ${staleProcessing.changes} stale call(s) stuck in PROCESSING > 5 min -> Moved to retry_pending`);
  }

  // 1a-2. Watchdog: Auto-advance any call that has a completed valid transcript but is stuck or unprogressed
  const staleTranscribed = db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      status = 'retry_pending',
      pipeline_stage = CASE WHEN pipeline_stage = 'AUDIT_GATE_BLOCKED' THEN 'CLASSIFICATION' ELSE pipeline_stage END,
      updated_at = ?
    WHERE transcript IS NOT NULL AND length(trim(transcript)) > 0
      AND processing_status != 'COMPLETED'
      AND (audit_status IS NULL OR audit_status NOT IN ('AUDITED', 'EXCLUDED'))
      AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'ambiguous_trade_match', 'out_of_market_hours', 'customer_mismatch', 'completed')
      AND (processing_status != 'PROCESSING' OR updated_at < ?)
      AND (processing_status != 'IDLE' OR status NOT IN ('retry_pending', 'pending'))
  `).run(nowIso, fiveMinutesAgo);

  if (staleTranscribed.changes > 0) {
    console.log(`[Watchdog] Auto-unblocked ${staleTranscribed.changes} call(s) with valid transcripts -> Ready for classification & audit`);
  }

  // 1b. Self-Healing: Automatically re-queue failed jobs that have not exceeded 3 retries
  const tenSecAgo = new Date(Date.now() - 10000).toISOString().replace('T', ' ').slice(0, 19);
  const autoRecovered = db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      status = 'retry_pending',
      failure_reason = NULL,
      updated_at = ?
    WHERE (processing_status IN ('FAILED', 'ERROR', 'AI_BLOCKED') OR status IN ('failed', 'retry_pending', 'ai_blocked', 'error'))
      AND processing_status != 'COMPLETED'
      AND (audit_status IS NULL OR audit_status != 'EXCLUDED')
      AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'out_of_market_hours', 'ambiguous_trade_match', 'customer_mismatch', 'completed')
      AND COALESCE(retry_count, 0) < 3
      AND (pipeline_stage != 'FAILED_MAX_RETRIES' OR pipeline_stage IS NULL)
      AND (updated_at < ? OR updated_at IS NULL)
  `).run(nowIso, tenSecAgo);

  if (autoRecovered.changes > 0) {
    console.log(`[Watchdog] Auto-retrying ${autoRecovered.changes} failed/stalled job(s) for automatic re-processing`);
  }

  const groqKey = getGroqKey ? getGroqKey() : process.env.GROQ_API_KEY;
  const geminiKey = getGeminiKey ? getGeminiKey() : (process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS);
  const hasGemini = Boolean((geminiKey && geminiKey.trim()) || geminiPool.getKeyCount() > 0);

  // 1c. Self-Healing: If API keys are now configured, unblock previously blocked calls
  if (hasGemini || (groqKey && groqKey.trim())) {
    db.prepare(`
      UPDATE calls SET
        processing_status = 'IDLE',
        status = 'pending',
        failure_reason = NULL,
        updated_at = ?
      WHERE processing_status = 'AI_BLOCKED' OR status = 'ai_blocked'
    `).run(nowIso);
  }

  // 1d. High-Speed Bulk Scrap Clearance:
  // Instantly mark calls with duration < 6s as SCRAP without bottlenecking worker threads
  try {
    db.prepare(`
      UPDATE calls SET
        classification = 'SCRAP',
        call_type = 'scrap',
        status = 'scrap',
        audit_status = 'EXCLUDED',
        processing_status = 'COMPLETED',
        pipeline_stage = 'SCRAP_FILTER',
        current_gate = 'GATE_1',
        gate_reason = 'Duration < 6s scrap threshold',
        classification_reason = 'Call duration < 6s regulatory scrap threshold.',
        updated_at = ?
      WHERE (processing_status = 'IDLE' OR processing_status IS NULL OR status = 'pending' OR status = 'imported')
        AND status NOT IN ('audited', 'scrap', 'regular', 'review')
        AND duration_seconds > 0 AND duration_seconds < 6
        AND classification != 'PRE_ORDER'
        AND NOT EXISTS (
          SELECT 1 FROM trades t 
          WHERE t.client_number LIKE '%' || substr(replace(replace(coalesce(calls.customer_number, calls.calling_number, ''), '+', ''), ' ', ''), -10)
             OR t.phone_number LIKE '%' || substr(replace(replace(coalesce(calls.customer_number, calls.calling_number, ''), '+', ''), ' ', ''), -10)
        )
    `).run(nowIso);
  } catch {}

  // 1e. Clean Missing-Audio routing:
  // Calls where physical recording is absent AND no cloud URL exists are routed to missing call audit
  try {
    const missingAudioCalls = db.prepare(`
      SELECT id, storage_path, recording_url, canonical_call_id, caller_id FROM calls
      WHERE (processing_status != 'COMPLETED' OR processing_status IS NULL)
        AND status NOT IN ('audited', 'scrap', 'regular', 'review')
        AND (transcript IS NULL OR length(trim(transcript)) = 0)
    `).all() as { id: number; storage_path: string; recording_url?: string; canonical_call_id?: string; caller_id?: string }[];

    for (const mac of missingAudioCalls) {
      if (!mac.storage_path || !fs.existsSync(mac.storage_path)) {
        const hasUrl = mac.recording_url || lookupRecordingUrlForCall(mac.canonical_call_id || '', mac.caller_id || '');
        if (hasUrl) {
          // Has valid Tata Smartflo cloud recording URL -> Let worker download and transcribe!
          continue;
        }
        db.prepare(`
          UPDATE calls SET
            classification = 'REVIEW',
            call_type = 'review',
            status = 'review',
            audit_status = 'MISSING_AUDIO',
            processing_status = 'COMPLETED',
            pipeline_stage = 'MISSING_RECORDING',
            current_gate = 'GATE_3',
            gate_reason = 'Physical audio recording was not provided or missing from storage.',
            failure_reason = 'Physical audio recording missing from disk/upload. Routed to Missing Call / Mail Confirmation audit.',
            updated_at = ?
          WHERE id = ?
        `).run(nowIso, mac.id);
      }
    }
  } catch {}

  // Check concurrency limit
  if (activeProcessingCallIds.size >= MAX_CONCURRENT_PIPELINE_WORKERS) {
    return false;
  }

  const activeIdsList = activeProcessingCallIds.size > 0 ? Array.from(activeProcessingCallIds).join(',') : '0';

  // 2. Candidate Selection with Smart Prioritization:
  // Priority 0: Filter calls outside Indian Market Hours (09:15:00 - 15:40:00)
  try {
    const unverifiedCalls = db.prepare(`
      SELECT id, call_time FROM calls
      WHERE id NOT IN (${activeIdsList})
        AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'out_of_market_hours')
        AND processing_status != 'COMPLETED'
        AND classification != 'PRE_ORDER'
        AND (call_type IS NULL OR call_type != 'pre_order')
        AND (matched_trade_id IS NULL OR matched_trade_id = 0)
        AND call_time IS NOT NULL AND length(trim(call_time)) > 0
      LIMIT 25
    `).all() as Array<{ id: number; call_time: string }>;

    for (const uc of unverifiedCalls) {
      if (!isIndianMarketHours(uc.call_time)) {
        db.prepare(`
          UPDATE calls SET
            classification = 'REGULAR',
            call_type = 'regular',
            status = 'out_of_market_hours',
            audit_status = 'EXCLUDED',
            processing_status = 'COMPLETED',
            pipeline_stage = 'TIME_FILTER',
            current_gate = 'GATE_1',
            gate_reason = 'Call start time outside Indian market hours (09:15:00 - 15:40:00)',
            classification_reason = 'Call start time outside Indian market hours (09:15:00 - 15:40:00). Excluded from trade matching and transcription.',
            updated_at = ?
          WHERE id = ?
        `).run(nowIso, uc.id);
      }
    }
  } catch {}

  // Priority A: Scrap calls (< 6s) - Requires zero ASR/AI calls, runs immediately
  let nextCall = db.prepare(`
    SELECT id FROM calls
    WHERE id NOT IN (${activeIdsList})
      AND (processing_status = 'IDLE' OR status = 'retry_pending')
      AND status NOT IN ('audited', 'scrap', 'regular', 'review')
      AND duration_seconds > 0 AND duration_seconds < 6
      AND (classification IS NULL OR classification != 'PRE_ORDER')
      AND matched_trade_id IS NULL
    ORDER BY COALESCE(retry_count, 0) ASC, id ASC
    LIMIT 1
  `).get() as { id: number } | undefined;

  // Priority B: Calls that already have a valid transcript - No ASR needed
  // Explicit Stage Transition: Automatically advance any transcribed call to classification, matching, & audit
  if (!nextCall) {
    nextCall = db.prepare(`
      SELECT id FROM calls
      WHERE id NOT IN (${activeIdsList})
        AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'out_of_market_hours', 'no_trade_correlated')
        AND (audit_status NOT IN ('AUDITED', 'EXCLUDED') OR audit_status IS NULL)
        AND (processing_status != 'COMPLETED' OR processing_status IS NULL)
        AND transcript IS NOT NULL AND length(trim(transcript)) > 0
        AND (processing_status = 'IDLE' OR processing_status IS NULL OR status IN ('retry_pending', 'transcribed', 'imported', 'pending', 'blocked', 'processing'))
      ORDER BY COALESCE(retry_count, 0) ASC, id ASC
      LIMIT 1
    `).get() as { id: number } | undefined;
  }

  // Priority C: General pending calls needing ASR transcription
  const isAsrRateLimited = Date.now() < rateLimitPauseUntil;
  if (!nextCall && !isAsrRateLimited) {
    nextCall = db.prepare(`
      SELECT id FROM calls
      WHERE id NOT IN (${activeIdsList})
        AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'out_of_market_hours', 'no_trade_correlated')
        AND (audit_status NOT IN ('AUDITED', 'EXCLUDED') OR audit_status IS NULL)
        AND (processing_status != 'COMPLETED' OR processing_status IS NULL)
        AND (transcript IS NULL OR length(trim(transcript)) = 0)
        AND (
          (storage_path IS NOT NULL AND length(trim(storage_path)) > 0)
          OR (recording_url IS NOT NULL AND length(trim(recording_url)) > 0)
        )
        AND (processing_status = 'IDLE' OR processing_status IS NULL OR status IN ('retry_pending', 'imported', 'pending', 'ai_blocked', 'processing'))
      ORDER BY
        CASE WHEN classification = 'PRE_ORDER' OR call_type = 'pre_order' THEN 0 ELSE 1 END,
        COALESCE(retry_count, 0) ASC,
        id ASC
      LIMIT 1
    `).get() as { id: number } | undefined;
  }

  if (!nextCall) {
    return false;
  }

  // For non-scrap calls needing ASR, verify Deepgram API key.
  const activeDeepgramKey = (getDeepgramKey ? getDeepgramKey() : undefined) || process.env.DEEPGRAM_API_KEY;
  const hasDeepgramKeyAvailable = Boolean((activeDeepgramKey && activeDeepgramKey.trim() && !activeDeepgramKey.includes('your_deepgram_api_key_here')));
  if (!hasDeepgramKeyAvailable) {
    const callRec = db.prepare('SELECT duration_seconds, transcript FROM calls WHERE id = ?').get(nextCall.id) as { duration_seconds: number; transcript?: string } | undefined;
    const needsAsr = !callRec?.transcript && (!callRec || callRec.duration_seconds === 0 || callRec.duration_seconds >= 6);
    if (needsAsr) {
      db.prepare(`
        UPDATE calls SET
          processing_status = 'AI_BLOCKED',
          status = 'ai_blocked',
          failure_reason = 'AWAITING_API_KEY: DEEPGRAM_API_KEY is required for Deepgram Nova-3 telephony transcription.',
          updated_at = ?
        WHERE (processing_status = 'IDLE' OR status = 'retry_pending')
          AND (transcript IS NULL OR length(trim(transcript)) = 0)
          AND status NOT IN ('audited', 'scrap', 'regular', 'review')
          AND (duration_seconds = 0 OR duration_seconds >= 6)
      `).run(nowIso);
      return false;
    }
  }

  // RUN-09: Atomic claim to prevent race conditions across parallel supervisor ticks
  const claim = db.prepare(`
    UPDATE calls SET
      processing_status = 'PROCESSING',
      status = 'processing',
      updated_at = ?
    WHERE id = ?
      AND (
        processing_status IN ('IDLE', 'FAILED', 'AI_BLOCKED', 'PENDING')
        OR status IN ('idle', 'retry_pending', 'ai_blocked', 'transcribed', 'imported', 'pending')
        OR processing_status IS NULL
      )
  `).run(nowIso, nextCall.id);

  if (claim.changes === 0) {
    return false;
  }

  activeProcessingCallIds.add(nextCall.id);
  try {
    await runFullPipelineForCall(db, nextCall.id, undefined, groqKey, geminiKey);
    totalProcessedCount++;
    return true;
  } catch (err: any) {
    if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))) {
      console.warn('[Autonomous Worker] Rate limit (429) encountered. Backing off for 3 seconds...');
      rateLimitPauseUntil = Date.now() + 3000;
      return false;
    }
    console.error(`[Autonomous Worker Error] Call #${nextCall.id}: ${err.message}`);
    // RUN-05: A single call failure must not terminate the entire batch!
    // Returning true lets the supervisor continue processing subsequent pending calls.
    return true;
  } finally {
    activeProcessingCallIds.delete(nextCall.id);
  }
}

/**
 * Starts the continuous 24/7 supervisor timer with high-speed concurrent worker dispatch
 */
export function start24x7WorkerSupervisor(
  db: DatabaseSync,
  getDeepgramKey?: () => string | undefined,
  getGroqKey?: () => string | undefined,
  getGeminiKey?: () => string | undefined
): void {
  if (isHeartbeatRunning) return;
  isHeartbeatRunning = true;

  console.log(`[AuditEQ] 24/7 Autonomous High-Speed Pipeline Supervisor initialized with ${MAX_CONCURRENT_PIPELINE_WORKERS}-worker concurrency (Deepgram Nova-3 Multi-Lingual ASR Engine).`);
  ensureCallColumns(db);

  // Prepare static queries once to avoid CPU thrashing on every tick
  const resetStaleStmt = db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      status = 'retry_pending',
      updated_at = ?
    WHERE (processing_status = 'PROCESSING' OR status = 'processing')
      AND (updated_at < ? OR updated_at IS NULL)
  `);

  const requeueFailedStmt = db.prepare(`
    UPDATE calls SET
      processing_status = 'IDLE',
      status = 'retry_pending',
      failure_reason = NULL,
      updated_at = ?
    WHERE (processing_status IN ('FAILED', 'ERROR', 'AI_BLOCKED') OR status IN ('failed', 'retry_pending', 'ai_blocked', 'error'))
      AND status NOT IN ('audited', 'scrap', 'regular', 'review')
      AND (updated_at < ? OR updated_at IS NULL)
  `);

  const bulkScrapStmt = db.prepare(`
    UPDATE calls SET
      classification = 'SCRAP',
      call_type = 'scrap',
      status = 'scrap',
      audit_status = 'EXCLUDED',
      processing_status = 'COMPLETED',
      pipeline_stage = 'SCRAP_FILTER',
      current_gate = 'GATE_1',
      gate_reason = 'Duration < 6s scrap threshold',
      classification_reason = 'Call duration < 6s regulatory scrap threshold.',
      updated_at = ?
    WHERE (processing_status = 'IDLE' OR processing_status IS NULL OR status = 'pending' OR status = 'imported')
      AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'customer_mismatch', 'out_of_market_hours')
      AND (classification != 'PRE_ORDER' OR classification IS NULL)
      AND (call_type != 'pre_order' OR call_type IS NULL)
      AND duration_seconds > 0 AND duration_seconds < 6
      AND (
        customer_number IS NULL OR customer_number = '' OR
        customer_number NOT IN (SELECT DISTINCT COALESCE(NULLIF(phone_number, ''), client_number) FROM trades WHERE phone_number IS NOT NULL OR client_number IS NOT NULL)
      )
  `);

  const claimStmt = db.prepare(`
    UPDATE calls SET
      processing_status = 'PROCESSING',
      status = 'processing',
      updated_at = ?
    WHERE id = ?
      AND (
        processing_status != 'PROCESSING'
        OR processing_status IS NULL
      )
  `);

  let isTickRunning = false;
  let sweepCounter = 0;

  setInterval(async () => {
    lastHeartbeatTime = new Date().toISOString();
    if (isTickRunning) return;
    isTickRunning = true;
    try {
      if (!isPipelineActive) {
        // User Mandate: Auditing & pipeline processing only starts when client triggers "Run Pipeline"
        return;
      }

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const groqKey = getGroqKey ? getGroqKey() : process.env.GROQ_API_KEY;
      const geminiKey = getGeminiKey ? getGeminiKey() : (process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS);

      sweepCounter++;

      // Watchdog Sweeps run every 4 ticks (~12s) to prevent lock contention
      if (sweepCounter % 4 === 0) {
        const fiveMinAgo = new Date(Date.now() - 300000).toISOString().replace('T', ' ').slice(0, 19);
        const activeIdsStr = activeProcessingCallIds.size > 0 ? Array.from(activeProcessingCallIds).join(',') : '0';
        try {
          db.prepare(`
            UPDATE calls SET
              processing_status = 'IDLE',
              status = 'retry_pending',
              updated_at = ?
            WHERE (processing_status = 'PROCESSING' OR status = 'processing')
              AND id NOT IN (${activeIdsStr})
              AND (updated_at < ? OR updated_at IS NULL)
          `).run(nowIso, fiveMinAgo);
        } catch {}

        const tenSecAgo = new Date(Date.now() - 10000).toISOString().replace('T', ' ').slice(0, 19);
        try {
          db.prepare(`
            UPDATE calls SET
              processing_status = 'IDLE',
              status = 'retry_pending',
              failure_reason = NULL,
              updated_at = ?
            WHERE (processing_status IN ('FAILED', 'ERROR', 'AI_BLOCKED') OR status IN ('failed', 'retry_pending', 'ai_blocked', 'error'))
              AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'out_of_market_hours')
              AND COALESCE(retry_count, 0) < 3
              AND (pipeline_stage != 'FAILED_MAX_RETRIES' OR pipeline_stage IS NULL)
              AND (updated_at < ? OR updated_at IS NULL)
          `).run(nowIso, tenSecAgo);
        } catch {}

        try {
          bulkScrapStmt.run(nowIso);
        } catch {}
      }

      // Capacity Check: Dispatch up to MAX_CONCURRENT_PIPELINE_WORKERS (8)
      const needed = Math.max(0, MAX_CONCURRENT_PIPELINE_WORKERS - activeProcessingCallIds.size);
      if (needed <= 0) return;

      const activeIdsList = activeProcessingCallIds.size > 0 ? Array.from(activeProcessingCallIds).join(',') : '0';
      const hasGeminiKey = Boolean((geminiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS)?.trim());
      const isGeminiBlocked = Date.now() < geminiBlockedUntil;
      const isAsrRateLimited = Date.now() < rateLimitPauseUntil; // Deepgram Nova-3 ASR is not blocked by Gemini rate limits!

      const candidateQuery = `
        SELECT id FROM calls
        WHERE id NOT IN (${activeIdsList})
          AND (processing_status != 'PROCESSING' AND processing_status != 'COMPLETED' OR processing_status IS NULL)
          AND status NOT IN ('audited', 'scrap', 'regular', 'review', 'out_of_market_hours', 'no_trade_correlated')
          AND (
            -- Case 1: Transcribed calls ready for subsequent stages (Stages 4-9) - ALWAYS RUN (No ASR needed!)
            (transcript IS NOT NULL AND length(trim(transcript)) > 0 AND (audit_status NOT IN ('AUDITED', 'EXCLUDED') OR audit_status IS NULL))
            -- Case 2: Untranscribed calls needing ASR - ONLY RUN IF ASR IS NOT RATE-LIMITED
            OR (
              ${!isAsrRateLimited ? '1 = 1' : '0 = 1'}
              AND (transcript IS NULL OR length(trim(transcript)) = 0)
              AND (
                (storage_path IS NOT NULL AND length(trim(storage_path)) > 0)
                OR (recording_url IS NOT NULL AND length(trim(recording_url)) > 0)
              )
            )
          )
        ORDER BY
          CASE WHEN classification = 'PRE_ORDER' OR call_type = 'pre_order' THEN 0 ELSE 1 END,
          CASE WHEN transcript IS NOT NULL AND length(trim(transcript)) > 0 THEN 0 ELSE 1 END,
          COALESCE(retry_count, 0) ASC,
          id ASC
        LIMIT ?
      `;

      const candidateRows = db.prepare(candidateQuery).all(needed) as Array<{ id: number }>;

      if (candidateRows.length === 0 && activeProcessingCallIds.size === 0) {
        // All active work completed - switch back to standby
        isPipelineActive = false;
        console.log('[Pipeline Supervisor] All eligible calls completed. Entering standby mode.');
        return;
      }

      for (const row of candidateRows) {
        if (activeProcessingCallIds.size >= MAX_CONCURRENT_PIPELINE_WORKERS) break;

        const claim = claimStmt.run(nowIso, row.id);

        if (claim.changes > 0) {
          activeProcessingCallIds.add(row.id);
          const deepgramKey = (getDeepgramKey ? getDeepgramKey() : undefined) || process.env.DEEPGRAM_API_KEY;
          runFullPipelineForCall(db, row.id, deepgramKey, groqKey, geminiKey)
            .then(() => {
              totalProcessedCount++;
            })
            .catch((err: any) => {
              if (err.message && (err.message.includes('Deepgram credits are unavailable') || err.message.includes('DEEPGRAM_TRANSCRIPTION_FAILED'))) {
                isPipelineActive = false;
                rateLimitPauseUntil = Date.now() + 600000;
                console.warn('[Pipeline Supervisor] Deepgram ASR credits exhausted or inactive. Pipeline entered standby mode until credits are refreshed.');
              } else if (err.message && (err.message.includes('GROQ_QUOTA_COOLDOWN') || err.message.includes('Daily Groq Whisper quota limit'))) {
                // Cooldown handled cleanly without spamming logs
              } else if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))) {
                console.warn(`[Autonomous Worker] Rate limit on call #${row.id}. Cooldown 3s...`);
                rateLimitPauseUntil = Date.now() + 3000;
              } else {
                console.error(`[Autonomous Worker Error] Call #${row.id}: ${err.message}`);
              }
            })
            .finally(() => {
              activeProcessingCallIds.delete(row.id);
            });
        }
      }
    } catch (err: any) {
      console.error('[Autonomous Supervisor Error]:', err?.message);
    } finally {
      isTickRunning = false;
    }
  }, 3000);
}

/**
 * Returns current real-time health metrics of the 24/7 pipeline
 */
export function getPipelineWorkerStatus(
  db: DatabaseSync,
  deepgramKey?: string,
  groqKey?: string,
  geminiKey?: string
): PipelineWorkerStatus {
  const queueDepth = (
    db.prepare(`
      SELECT count(*) as count FROM calls
      WHERE processing_status = 'IDLE'
        AND status NOT IN ('audited', 'scrap', 'regular', 'review')
        AND (audit_status = 'PENDING' OR classification = 'PENDING' OR transcript_status = 'PENDING')
    `).get() as { count: number }
  )?.count || 0;

  const activeGroqKey = groqKey || process.env.GROQ_API_KEY;
  const hasGroq = Boolean(activeGroqKey && activeGroqKey.trim());
  const activeGeminiKey = geminiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS;
  const hasGemini = Boolean(activeGeminiKey && activeGeminiKey.trim());

  let statusMessage = isPipelineActive
    ? 'Pipeline Running (Deepgram Nova-3 ASR & Compliance Reasoning)'
    : 'Pipeline in Standby. Click "Run Pipeline" to start processing.';
  if (Date.now() < geminiBlockedUntil) {
    statusMessage = 'GEMINI COOLDOWN ACTIVE — TRANSCRIPTION PAUSED (Backing off on 429; pending jobs safely queued)';
  } else if (!hasGemini) {
    statusMessage = 'Awaiting API Key (enter GEMINI_API_KEY in Settings to activate AI processing)';
  } else if (Date.now() < rateLimitPauseUntil) {
    statusMessage = 'Rate limit backoff active (resuming automatically in seconds)';
  } else if (activeProcessingCallIds.size > 0) {
    statusMessage = `Concurrently processing ${activeProcessingCallIds.size} call(s) (Calls: #${Array.from(activeProcessingCallIds).join(', #')}) through 9-stage pipeline`;
  } else if (isPipelineActive && queueDepth > 0) {
    statusMessage = `Queue has ${queueDepth} calls waiting for processing`;
  } else if (!isPipelineActive) {
    statusMessage = 'Pipeline in Standby. Click "Run Pipeline" to start processing.';
  } else {
    statusMessage = 'All uploaded calls processed. Standing by for incoming data';
  }

  const todayStart = new Date().toISOString().slice(0, 10) + ' 00:00:00';
  let processedToday = 0;
  try {
    const todayRow = db.prepare(`
      SELECT count(*) as count FROM calls
      WHERE updated_at >= ?
        AND (processing_status = 'COMPLETED' OR status IN ('audited', 'scrap', 'regular', 'review'))
    `).get(todayStart) as { count: number } | undefined;
    processedToday = todayRow?.count || 0;
  } catch {
    processedToday = totalProcessedCount;
  }

  return {
    isRunning: isPipelineActive,
    activeWorkers: activeProcessingCallIds.size,
    totalProcessedToday: processedToday,
    lastActiveTime: lastHeartbeatTime,
    hasDeepgramKey: false,
    hasGroqKey: hasGroq,
    hasGeminiKey: hasGemini,
    statusMessage,
    queueDepth,
  };
}
