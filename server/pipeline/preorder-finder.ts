// =============================================================
// ADAM-AR Pre-Order Finding & Reverse-Walk Trade Matcher
//
// 95% Regulatory Mandate:
// In 95% of cases, the pre-order call is the call made just before
// the trade execution time.
//
// Core Process:
// 1. Process client codes and executed trades.
// 2. Identify customer registered phone or client UCC.
// 3. Retrieve calls matching that phone/UCC preceding trade execution.
// 4. Reverse-chronological ordering (closest call immediately preceding trade execution first).
// 5. 95% Immediate Preceding Call Rule:
//    - Pick closest call made before trade execution time.
//    - Transcribe with resilient multi-engine ASR (Gemini Flash + Groq Whisper Large v3).
//    - Verify trade discussion (Symbol, CMP/Price, Qty, or spoken order intent: buy/sell/kar do/theek hai).
//    - If verified or sole preceding call within trading session, confirm match & run 5-point audit.
//    - If non-trading (silence/wrong number), walk back to earlier calls.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { geminiPool, type FivePointAuditResult } from '../gemini-pool';
import { stage3TranscribeCall } from './transcription';
import { transcribeAudioFile } from '../asr-engine';
import { transcribeWithDeepgram } from '../deepgram-engine';
import { evaluateScrapCall } from '../audio-dsp';
import {
  formatCleanClientCode,
  isStrictValidClientCode,
  normalizePhoneNumber,
  comparePhoneNumbers,
  matchSymbolInTranscript,
} from '../normalizer';
import { parseTradeSecondsFromMidnight } from './tradePreOrderClusterer';
import type { TradeRecord, CallRecord } from '../../src/types';

export interface PreOrderAuditOutcome {
  tradeId: number;
  clientCode: string;
  symbol: string;
  quantity: number;
  price?: number;
  tradeTime: string;
  customerNumber: string;
  outcomeType: 'VOICE_CALL_MATCHED' | 'MAIL_CONFIRMATION' | 'NO_PREORDER_CALL_FOUND' | 'INVALID_CLIENT_CODE';
  matchedCallId?: number;
  matchedCallRecording?: string;
  matchedCallTime?: string;
  callsCheckedCount: number;
  fivePointAudit?: FivePointAuditResult;
  notes: string;
}

export interface ClientTradeAuditSummary {
  clientCode: string;
  isValidClientCode: boolean;
  totalTrades: number;
  matchedVoiceTrades: number;
  mailConfirmationTrades: number;
  unmatchedTrades: number;
  outcomes: PreOrderAuditOutcome[];
}

/**
 * Runs the complete Pre-Order finding workflow across all trades in the database
 */
export async function runPreOrderFindingPipeline(
  db: DatabaseSync,
  onProgress?: (msg: string, completed: number, total: number) => void
): Promise<ClientTradeAuditSummary[]> {
  console.log('[PreOrderFinder] Starting Trade-Driven Pre-Order Finding & 95% Immediate Preceding Call Pipeline...');

  // 1. Fetch all trades from database
  const trades = db.prepare(`
    SELECT * FROM trades ORDER BY trade_date ASC, trade_time ASC, id ASC
  `).all() as unknown as TradeRecord[];

  if (!trades || trades.length === 0) {
    console.log('[PreOrderFinder] No trade records found in database.');
    return [];
  }

  // Gather all unique customer phone numbers and client codes present in Trade data
  const tradePhones = new Set<string>();
  const tradeClients = new Set<string>();
  for (const t of trades) {
    const p = normalizePhoneNumber((t as any).customer_number || t.client_number || t.phone_number || '');
    if (p && p.length >= 7) tradePhones.add(p);
    const c = formatCleanClientCode(t.client || (t as any).client_code);
    if (c) tradeClients.add(c);
  }

  // 2. Classify all calls in metadata per User Rules:
  // - If call is less than 6 sec or IVR or voice mail (no 2-sided conversation) -> SCRAP calls
  // - If number exists in metadata but NOT in trade data -> REGULAR calls
  try {
    const allCalls = db.prepare('SELECT * FROM calls').all() as unknown as CallRecord[];
    const callCols = new Set((db.prepare('PRAGMA table_info(calls)').all() as any[]).map(c => c.name));

    for (const call of allCalls) {
      const dur = call.duration_seconds || 0;
      const rawCallPhone = call.customer_number || call.calling_number || call.phone_number || '';
      const normCallPhone = normalizePhoneNumber(rawCallPhone);
      const callUcc = formatCleanClientCode(call.client_code || call.client);

      const scrapCheck = evaluateScrapCall(dur, 0.6, 2, call.transcript || '');

      // Rule: If call is less than 6 sec or IVR or voice mail -> scrap call
      if (dur < 6 || scrapCheck.isScrap) {
        if (callCols.has('classification')) {
          db.prepare(`
            UPDATE calls SET
              classification = 'SCRAP',
              status = 'SCRAP',
              call_type = 'scrap',
              classification_reason = ?
            WHERE id = ?
          `).run(scrapCheck.reason || 'Call is less than 6 seconds or IVR/voicemail (no two-sided dialogue)', call.id);
        }
        continue;
      }

      // Rule: If number exists in metadata but not in trade data -> regular call
      const phoneInTrades = normCallPhone && tradePhones.has(normCallPhone);
      const clientInTrades = callUcc && tradeClients.has(callUcc);

      if (!phoneInTrades && !clientInTrades) {
        if (callCols.has('classification')) {
          db.prepare(`
            UPDATE calls SET
              classification = 'REGULAR',
              status = 'REGULAR',
              call_type = 'regular',
              classification_reason = 'Number exists in call metadata but not in trade data (regular non-trade call)'
            WHERE id = ?
          `).run(call.id);
        }
      }
    }
  } catch (err: any) {
    console.warn('[PreOrderFinder] Warning during call classification sweep:', err?.message);
  }

  // 3. Group trades by normalized Client Code
  const tradesByClient = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const rawClient = (t as any).client_code || t.client || '';
    const cleanClient = formatCleanClientCode(rawClient);
    const key = cleanClient || `CLIENT_${t.id}`;
    if (!tradesByClient.has(key)) {
      tradesByClient.set(key, []);
    }
    tradesByClient.get(key)!.push(t);
  }

  console.log(`[PreOrderFinder] Grouped ${trades.length} trades across ${tradesByClient.size} unique client codes.`);

  const clientSummaries: ClientTradeAuditSummary[] = [];
  const clientCodes = Array.from(tradesByClient.keys());
  let processedClients = 0;

  for (const clientCode of clientCodes) {
    const clientTrades = tradesByClient.get(clientCode)!;
    processedClients++;

    if (onProgress) {
      onProgress(`Processing client ${clientCode} (${processedClients}/${clientCodes.length})`, processedClients, clientCodes.length);
    }

    const isValid = isStrictValidClientCode(clientCode) || clientCode.length >= 3;
    const summary: ClientTradeAuditSummary = {
      clientCode,
      isValidClientCode: isValid,
      totalTrades: clientTrades.length,
      matchedVoiceTrades: 0,
      mailConfirmationTrades: 0,
      unmatchedTrades: 0,
      outcomes: [],
    };

    // Process each trade for this client code
    for (const trade of clientTrades) {
      const outcome = await findAndAuditPreOrderForTrade(db, trade, clientCode);
      summary.outcomes.push(outcome);

      if (outcome.outcomeType === 'VOICE_CALL_MATCHED') {
        summary.matchedVoiceTrades++;
      } else if (outcome.outcomeType === 'MAIL_CONFIRMATION') {
        summary.mailConfirmationTrades++;
      } else {
        summary.unmatchedTrades++;
      }
    }

    clientSummaries.push(summary);
  }

  console.log(`[PreOrderFinder] Completed Pre-Order Finding. Summaries generated for ${clientSummaries.length} clients.`);
  return clientSummaries;
}

/**
 * Finds and audits the pre-order call for a single trade using 95% immediate-prior temporal primacy
 */
export async function findAndAuditPreOrderForTrade(
  db: DatabaseSync,
  trade: TradeRecord,
  clientCode: string
): Promise<PreOrderAuditOutcome> {
  const rawTradePhone = (trade as any).customer_number || trade.client_number || trade.phone_number || '';
  const normTradePhone = normalizePhoneNumber(rawTradePhone);
  const tradeTime = trade.trade_time || (trade as any).order_timestamp || '';
  const tradeSeconds = parseTradeSecondsFromMidnight(tradeTime, trade.trade_date);
  const tradeSymbol = (trade.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim();

  // Search candidate calls by phone number OR client code
  let matchingCalls: CallRecord[] = [];
  const callCols = new Set((db.prepare('PRAGMA table_info(calls)').all() as any[]).map(c => c.name));

  const phoneConditions: string[] = [];
  const phoneVals: any[] = [];
  if (normTradePhone && normTradePhone.length >= 7) {
    if (callCols.has('customer_number')) {
      phoneConditions.push('customer_number = ?', 'customer_number LIKE ?');
      phoneVals.push(normTradePhone, `%${normTradePhone}`);
    }
    if (callCols.has('phone_number')) {
      phoneConditions.push('phone_number = ?', 'phone_number LIKE ?');
      phoneVals.push(normTradePhone, `%${normTradePhone}`);
    }
    if (callCols.has('calling_number')) {
      phoneConditions.push('calling_number = ?');
      phoneVals.push(normTradePhone);
    }
    if (callCols.has('caller_id')) {
      phoneConditions.push('caller_id = ?');
      phoneVals.push(normTradePhone);
    }
  }

  const clientConditions: string[] = [];
  const clientVals: any[] = [];
  if (clientCode) {
    if (callCols.has('client_code')) {
      clientConditions.push('client_code = ?');
      clientVals.push(clientCode);
    }
    if (callCols.has('client')) {
      clientConditions.push('client = ?');
      clientVals.push(clientCode);
    }
  }

  const allConditions = [...phoneConditions, ...clientConditions];
  const allVals = [...phoneVals, ...clientVals];

  if (allConditions.length > 0) {
    matchingCalls = db.prepare(`
      SELECT * FROM calls
      WHERE (${allConditions.join(' OR ')})
      ORDER BY call_time DESC, id DESC
    `).all(...allVals) as unknown as CallRecord[];
  }

  const hasTradePhone = Boolean(normTradePhone && normTradePhone.length === 10);
  let phoneExistsInCalls = false;
  if (hasTradePhone) {
    try {
      const callMatch = db.prepare(`
        SELECT 1 FROM calls WHERE
          customer_number = ? OR calling_number = ? OR phone_number = ? OR registered_number = ?
        LIMIT 1
      `).get(normTradePhone, normTradePhone, normTradePhone, normTradePhone);
      phoneExistsInCalls = Boolean(callMatch);
    } catch {
      const callMatch = db.prepare(`
        SELECT 1 FROM calls WHERE
          customer_number = ? OR calling_number = ? OR phone_number = ?
        LIMIT 1
      `).get(normTradePhone, normTradePhone, normTradePhone);
      phoneExistsInCalls = Boolean(callMatch);
    }
  }

  // User Mandate 2: Mail confirmations are ONLY those where the phone number exists in trade.csv BUT NOT in call.csv
  if (hasTradePhone && !phoneExistsInCalls) {
    return recordMailConfirmation(
      db,
      trade,
      clientCode,
      `Client phone (${normTradePhone}) exists in trade data, but does not exist in call metadata. Routed to Mail Confirmation.`
    );
  }

  if (!matchingCalls || matchingCalls.length === 0) {
    return {
      tradeId: trade.id,
      clientCode,
      symbol: trade.symbol,
      quantity: trade.quantity,
      price: trade.price,
      tradeTime,
      customerNumber: normTradePhone,
      outcomeType: 'NO_PREORDER_CALL_FOUND',
      callsCheckedCount: 0,
      notes: `No matching pre-order call record found for customer phone (${normTradePhone || 'N/A'}) or client code (${clientCode}).`,
    };
  }

  // Filter calls made BEFORE trade execution time (with 45s clock-skew tolerance)
  const priorCalls: Array<{ call: CallRecord; callSeconds: number; deltaSec: number }> = [];

  for (const c of matchingCalls) {
    const cTime = c.call_time || '';
    const cSec = parseTradeSecondsFromMidnight(cTime, c.call_date || trade.trade_date);
    const deltaSec = tradeSeconds - cSec;

    // Call must be placed before or at the trade execution time (tolerance: up to 45s after)
    // Within 2 hours (7200s) temporal window
    if (deltaSec >= -45 && deltaSec <= 7200) {
      priorCalls.push({ call: c, callSeconds: cSec, deltaSec });
    }
  }

  if (priorCalls.length === 0) {
    return {
      tradeId: trade.id,
      clientCode,
      symbol: trade.symbol,
      quantity: trade.quantity,
      price: trade.price,
      tradeTime,
      customerNumber: normTradePhone,
      outcomeType: 'NO_PREORDER_CALL_FOUND',
      callsCheckedCount: 0,
      notes: `Calls found for customer, but none placed prior to trade execution time (${tradeTime}). No valid pre-order call exists.`,
    };
  }

  // Sort calls reverse-chronologically: Call placed immediately prior to trade comes FIRST (95% rule)
  priorCalls.sort((a, b) => b.callSeconds - a.callSeconds);

  let callsChecked = 0;

  for (const { call, deltaSec } of priorCalls) {
    callsChecked++;
    console.log(
      `[PreOrderFinder] Testing Candidate Call #${call.id} (${call.call_time}, ${Math.round(deltaSec)}s prior) for Trade #${trade.id} (${tradeSymbol} at ${tradeTime})...`
    );

    // Resolve or transcribe audio if needed
    let transcript = call.transcript || '';
    if (!transcript || transcript.trim().length < 15) {
      try {
        console.log(`[PreOrderFinder] Transcribing Call #${call.id} via Stage 3 Deepgram Nova-3...`);
        const txRes = await stage3TranscribeCall(db, call.id);
        transcript = txRes.text;
      } catch (transcribeErr: any) {
        console.warn(`[PreOrderFinder] Stage 3 transcription warning for Call #${call.id}:`, transcribeErr?.message);
      }
    }

    // Genuineness check: scrap calls (silence, short voicemail, <6s) must be skipped
    const txLower = (transcript || '').toLowerCase();
    const isSilence = txLower.includes('silence') || txLower.includes('no speech detected') || transcript.trim().length < 5;
    const durSec = call.duration_seconds;
    const isVoicemail = txLower.includes('voice mail') || txLower.includes('voicemail') || txLower.includes('forwarded') || txLower.includes('leave a message') || txLower.includes('record your name') || txLower.includes('record your message') || txLower.includes('person is available') || txLower.includes('person you are trying to reach');
    const isShortScrap = durSec !== null && durSec !== undefined && durSec > 0 && durSec < 6;
    const isScrap = isShortScrap || isSilence || isVoicemail;

    if (isScrap) {
      continue;
    }

    // 95% RULE VERIFICATION:
    // In 95% of cases, the pre-order call is the call made just before the trade execution time.
    const isImmediatePreceding = callsChecked === 1 && deltaSec >= -45 && deltaSec <= 1800; // within 30 min
    const isSymbolSpoken = transcript ? matchSymbolInTranscript(tradeSymbol, transcript).matched : false;

    // Detect trading order keywords
    const orderKeywordsRegex = /\b(?:buy|sell|order|shares?|lot|cmp|market\s*price|limit|quantity|price|bhav|kharid|bech|kar\s*do|theek\s*hai|yes|confirm|le\s*lo|daal\s*do)\b/i;
    const hasOrderKeywords = transcript ? orderKeywordsRegex.test(transcript) : false;

    let isConfirmed = false;
    if (transcript && transcript.length >= 20) {
      const orderVerif = await geminiPool.verifyTradeOrderInTranscript(transcript, {
        symbol: tradeSymbol,
        quantity: trade.quantity,
        price: trade.price,
        order_type: (trade as any).order_type,
      });

      isConfirmed = orderVerif.isConfirmed || (isSymbolSpoken && (orderVerif.quantityMentioned || orderVerif.priceOrCmpMentioned));
    }

    // 95% Mandate: If it's the call made just before trade execution with order context or sole prior call
    if (!isConfirmed && isImmediatePreceding) {
      if (hasOrderKeywords || isSymbolSpoken) {
        isConfirmed = true; // Confirmed under 95% immediate-prior pre-order rule
      }
    }

    if (isConfirmed) {
      console.log(`[PreOrderFinder] Confirmed Pre-Order Call #${call.id} for Trade #${trade.id} (${tradeSymbol})!`);

      // Update call and trade correlation in DB dynamically based on existing schema
      const callUpdates: string[] = [];
      const callUpdateVals: any[] = [];
      if (callCols.has('matched_trade_id')) { callUpdates.push('matched_trade_id = ?'); callUpdateVals.push(trade.id); }
      if (callCols.has('client_code')) { callUpdates.push('client_code = ?'); callUpdateVals.push(clientCode); }
      if (callCols.has('status')) { callUpdates.push("status = 'AUDITED'"); }
      if (callCols.has('classification')) { callUpdates.push("classification = 'PRE_ORDER'"); }
      if (callCols.has('call_type')) { callUpdates.push("call_type = 'pre_order'"); }
      if (callCols.has('updated_at')) { callUpdates.push("updated_at = datetime('now')"); }

      if (callUpdates.length > 0) {
        callUpdateVals.push(call.id);
        db.prepare(`UPDATE calls SET ${callUpdates.join(', ')} WHERE id = ?`).run(...callUpdateVals);
      }

      try {
        const tradeCols = new Set((db.prepare('PRAGMA table_info(trades)').all() as any[]).map(c => c.name));
        const tradeUpdates: string[] = [];
        const tradeUpdateVals: any[] = [];
        if (tradeCols.has('status')) { tradeUpdates.push("status = 'MATCHED'"); }
        if (tradeCols.has('notes')) { tradeUpdates.push("notes = ?"); tradeUpdateVals.push(`Matched to Pre-Order Call #${call.id} (${call.call_time})`); }
        if (tradeCols.has('matched_call_id')) { tradeUpdates.push("matched_call_id = ?"); tradeUpdateVals.push(call.id); }
        if (tradeUpdates.length > 0) {
          tradeUpdateVals.push(trade.id);
          db.prepare(`UPDATE trades SET ${tradeUpdates.join(', ')} WHERE id = ?`).run(...tradeUpdateVals);
        }
      } catch (err: any) {
        console.warn(`[PreOrderFinder] Could not update trades:`, err?.message);
      }

      // Run 5-point equity dealer compliance audit
      const fivePoint = await geminiPool.performFivePointAudit(
        {
          customerNumber: normTradePhone || call.customer_number || call.calling_number || '',
          callTime: call.call_time || '',
          callDate: call.call_date || trade.trade_date,
        },
        {
          registeredNumber: normTradePhone,
          orderTimestamp: tradeTime,
          symbol: tradeSymbol,
          quantity: trade.quantity,
          price: trade.price,
        },
        transcript || 'Dialogue confirmed order parameters.'
      );

      // Save scorecard
      saveAuthoritativeScorecard(db, call, trade, clientCode, fivePoint);

      return {
        tradeId: trade.id,
        clientCode,
        symbol: trade.symbol,
        quantity: trade.quantity,
        price: trade.price,
        tradeTime,
        customerNumber: normTradePhone,
        outcomeType: 'VOICE_CALL_MATCHED',
        matchedCallId: call.id,
        matchedCallRecording: call.recording_name || call.original_filename || call.canonical_call_id,
        matchedCallTime: call.call_time,
        callsCheckedCount: callsChecked,
        fivePointAudit: fivePoint,
        notes: `Pre-order confirmed in call placed at ${call.call_time} (${Math.round(deltaSec)}s prior - 95% immediate candidate).`,
      };
    }
  }

  // All prior calls checked without order match
  return {
    tradeId: trade.id,
    clientCode,
    symbol: trade.symbol,
    quantity: trade.quantity,
    price: trade.price,
    tradeTime,
    customerNumber: normTradePhone,
    outcomeType: 'NO_PREORDER_CALL_FOUND',
    callsCheckedCount: callsChecked,
    notes: `Checked ${callsChecked} call(s) prior to trade execution without order confirmation dialogue.`,
  };
}

function recordMailConfirmation(
  db: DatabaseSync,
  trade: TradeRecord,
  clientCode: string,
  reason: string
): PreOrderAuditOutcome {
  try {
    db.prepare(`
      UPDATE trades SET
        status = 'MAIL_CONFIRMED',
        notes = ?
      WHERE id = ?
    `).run(reason, trade.id);
  } catch {}

  return {
    tradeId: trade.id,
    clientCode,
    symbol: trade.symbol,
    quantity: trade.quantity,
    price: trade.price,
    tradeTime: trade.trade_time || '',
    customerNumber: (trade as any).customer_number || trade.phone_number || '',
    outcomeType: 'MAIL_CONFIRMATION',
    callsCheckedCount: 0,
    notes: reason,
  };
}

/**
 * Persists the 5-point equity dealer scorecard and audit record cleanly to the database
 */
function saveAuthoritativeScorecard(
  db: DatabaseSync,
  call: CallRecord,
  trade: TradeRecord,
  clientCode: string,
  audit: FivePointAuditResult
): void {
  try {
    const q1Pass = audit.q1_registered_number.status === 'PASS';
    const q2Pass = audit.q2_regulatory_norms.status === 'PASS';
    const q3Pass = audit.q3_scrip_price_qty.status === 'PASS';
    const q4Pass = audit.q4_customer_acknowledged.status === 'PASS';
    const q5Pass = audit.q5_no_return_commitment.status === 'PASS';

    let score = 0;
    if (q1Pass) score += 20;
    if (q2Pass) score += 20;
    if (q3Pass) score += 20;
    if (q4Pass) score += 20;
    if (q5Pass) score += 20;

    const isFatal = (!q1Pass || !q2Pass || !q5Pass) ? 1 : 0;
    const fatalReasons: string[] = [];
    if (!q1Pass) fatalReasons.push('Q1: Non-registered calling number');
    if (!q2Pass) fatalReasons.push('Q2: Post-order execution call');
    if (!q5Pass) fatalReasons.push('Q5: Prohibited return commitment given');

    const now = new Date().toISOString();

    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map(t => t.name)
    );

    let auditId = call.id;

    // 1. Insert or update audits table if it exists
    if (tables.has('audits')) {
      try {
        const auditRes = db.prepare(`
          INSERT INTO audits (
            call_id, trade_id, status, score,
            q1, q1_evidence,
            q2, q2_evidence,
            q3, q3_evidence,
            q4, q4_evidence,
            q5, q5_evidence,
            audit_comment, created_at, updated_at
          ) VALUES (?, ?, 'audited', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          call.id, trade.id, score,
          audit.q1_registered_number.status, `${audit.q1_registered_number.evidence} | ${audit.q1_registered_number.reason}`,
          audit.q2_regulatory_norms.status, `${audit.q2_regulatory_norms.evidence} | ${audit.q2_regulatory_norms.reason}`,
          audit.q3_scrip_price_qty.status, `${audit.q3_scrip_price_qty.evidence} | ${audit.q3_scrip_price_qty.reason}`,
          audit.q4_customer_acknowledged.status, `${audit.q4_customer_acknowledged.evidence} | ${audit.q4_customer_acknowledged.reason}`,
          audit.q5_no_return_commitment.status, `${audit.q5_no_return_commitment.evidence} | ${audit.q5_no_return_commitment.reason}`,
          audit.summary, now, now
        );
        if (auditRes?.lastInsertRowid) {
          auditId = Number(auditRes.lastInsertRowid);
        }
      } catch (err: any) {
        console.warn(`[PreOrderFinder] Error inserting into audits:`, err?.message);
      }
    }

    // 2. Insert or update scorecards table if it exists
    if (tables.has('scorecards')) {
      const scCols = new Set(
        (db.prepare('PRAGMA table_info(scorecards)').all() as any[]).map(c => c.name)
      );

      const fieldMap: Record<string, any> = {
        audit_id: auditId,
        call_id: call.id,
        trade_id: trade.id,
        resolved_trade_id: trade.id,
        caller_name: call.caller_name || trade.dealer || 'Dealer',
        dealer: call.dealer || trade.dealer || '',
        team: call.team || trade.team || '',
        client: clientCode,
        client_code: clientCode,
        trade_phone: (trade as any).customer_number || trade.phone_number || '',
        calling_number: call.calling_number || call.customer_number || '',
        registered_number: (trade as any).customer_number || trade.phone_number || '',
        trade_date: trade.trade_date,
        call_date: call.call_date || trade.trade_date,
        score: score,
        overall_score: score,
        passed: isFatal ? 0 : 1,
        overall_status: isFatal ? 'FAIL' : 'PASS',
        is_fatal: isFatal,
        fatal_reasons: fatalReasons.join('; '),
        q1_status: audit.q1_registered_number.status,
        q1_evidence: `${audit.q1_registered_number.evidence} | ${audit.q1_registered_number.reason}`,
        q2_status: audit.q2_regulatory_norms.status,
        q2_evidence: `${audit.q2_regulatory_norms.evidence} | ${audit.q2_regulatory_norms.reason}`,
        q3_status: audit.q3_scrip_price_qty.status,
        q3_evidence: `${audit.q3_scrip_price_qty.evidence} | ${audit.q3_scrip_price_qty.reason}`,
        q4_status: audit.q4_customer_acknowledged.status,
        q4_evidence: `${audit.q4_customer_acknowledged.evidence} | ${audit.q4_customer_acknowledged.reason}`,
        q5_status: audit.q5_no_return_commitment.status,
        q5_evidence: `${audit.q5_no_return_commitment.evidence} | ${audit.q5_no_return_commitment.reason}`,
        audit_comment: audit.summary,
        summary: audit.summary,
        generated_at: now,
        created_at: now,
      };

      const matchedCols: string[] = [];
      const matchedVals: any[] = [];
      for (const [col, val] of Object.entries(fieldMap)) {
        if (scCols.has(col)) {
          matchedCols.push(col);
          matchedVals.push(val);
        }
      }

      if (matchedCols.length > 0) {
        const placeholders = matchedCols.map(() => '?').join(', ');
        db.prepare(`
          INSERT OR REPLACE INTO scorecards (${matchedCols.join(', ')})
          VALUES (${placeholders})
        `).run(...matchedVals);
      }
    }
  } catch (err: any) {
    console.error(`[PreOrderFinder] Error saving scorecard for Call #${call.id}:`, err?.message);
  }
}
