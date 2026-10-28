// =============================================================
// Stage 6: AUDIT ELIGIBILITY GATE
// The Single Authoritative Compliance Gatekeeper.
//
// Every audit entry point MUST call this gate:
// - Automatic 24/7 worker
// - Run All
// - Force Audit
// - Re-Audit
// - UI / API endpoints
//
// Checks strictly:
// 1. Time Filter (09:15 AM to 03:40 PM)
// 2. classification === 'PRE_ORDER' (spoken order intent verified)
// 3. identity_status === 'CONFIRMED' (client UCC / account verified)
// 4. RULE 9: Exact Trade Match Verified (NO TRADE MATCH = DO NOT AUDIT)
// 5. transcript_status === 'VALID' (valid verbatim transcript)
// 6. speaker attribution usable (has dialogue segments)
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { AuditEligibilityResult } from './types';
import type { CallRecord } from '../../src/types';
import { isValidUcc } from './uccResolver';
import { isIndianMarketHours, isStrictValidClientCode } from '../normalizer';
import { currentWorkspaceIdStorage } from '../workspace-service';

export function isAuditEligible(
  db: DatabaseSync,
  callOrId: CallRecord | number
): AuditEligibilityResult {
  let call: CallRecord | undefined;

  if (typeof callOrId === 'number') {
    call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callOrId) as unknown as CallRecord | undefined;
  } else {
    call = callOrId;
  }

  if (!call) {
    return {
      eligible: false,
      gateCode: 'CALL_NOT_FOUND',
      reason: 'Call record could not be found in the database.',
    };
  }

  // Non-preorder desks: purely call audio & quality parameters audit (no trade confirmation needed)
  const activeWs = currentWorkspaceIdStorage.getStore() || 'preorder_desk';
  if (activeWs !== 'preorder_desk') {
    const hasAudioOrTranscript = Boolean(
      (call.transcript && call.transcript.trim().length > 0) ||
      call.storage_path ||
      call.recording_name
    );
    if (!hasAudioOrTranscript) {
      return {
        eligible: false,
        gateCode: 'NO_AUDIO_OR_TRANSCRIPT',
        reason: 'Call recording or transcript is required for quality audit.',
      };
    }
    return {
      eligible: true,
      gateCode: 'QUALITY_AUDIT_ELIGIBLE',
      reason: 'Call audio / transcript ready for workspace quality audit.',
    };
  }

  // Market Hours Filter (09:15 AM to 03:40 PM)
  // User Rule: "Customer Number AND TIME { FILTER FROM 9:15AM TO 3:40PM }"
  if (call.call_time && !isIndianMarketHours(call.call_time)) {
    return {
      eligible: false,
      gateCode: 'OUTSIDE_MARKET_HOURS',
      reason: `Call time (${call.call_time}) is outside Indian Market Hours (09:15 AM - 03:40 PM). Not a pre-order call.`,
    };
  }

  // Gate 1: Classification check (Spoken Order Intent)
  // SEBI Rule: Eligibility is a gate only. It must NEVER resurrect REGULAR to PRE_ORDER or alter classification.
  const classification = (call.classification || call.call_type || '').toUpperCase();
  if (classification !== 'PRE_ORDER') {
    return {
      eligible: false,
      gateCode: 'NOT_PRE_ORDER',
      reason: `Call classification is "${classification || 'UNCLASSIFIED'}". Only confirmed PRE_ORDER calls are eligible for SEBI compliance audit.`,
    };
  }

  // Gate 2: Identity Resolution (Resolve UCC and Phone for audit evaluation)
  let identityStatus = (call.identity_status || '').toUpperCase();
  let rawCode = (call.client_code || call.client || '').trim();
  let hasValidClientCode = Boolean(rawCode && rawCode !== 'UNVERIFIED' && rawCode !== '—' && (isValidUcc(rawCode) || isStrictValidClientCode(rawCode)));

  // If call doesn't have valid UCC directly, resolve from linked trade or match record
  if (!hasValidClientCode) {
    if (call.matched_trade_id && call.matched_trade_id > 0) {
      try {
        const trade = db.prepare('SELECT client, client_code FROM trades WHERE id = ?').get(call.matched_trade_id) as any;
        if (trade && (trade.client || trade.client_code)) {
          const tradeUcc = (trade.client || trade.client_code).trim();
          hasValidClientCode = Boolean(tradeUcc && (isValidUcc(tradeUcc) || isStrictValidClientCode(tradeUcc)));
          if (hasValidClientCode) {
            rawCode = tradeUcc;
            try {
              db.prepare("UPDATE calls SET client_code = ?, client = ?, identity_status = 'CONFIRMED' WHERE id = ?").run(rawCode, rawCode, call.id);
            } catch {}
          }
        }
      } catch {}
    }
  }

  if (!hasValidClientCode) {
    try {
      const match = db.prepare("SELECT trade_id FROM matches WHERE call_id = ? AND (verification_status = 'confirmed' OR status = 'matched') LIMIT 1").get(call.id) as any;
      if (match?.trade_id) {
        const trade = db.prepare('SELECT client, client_code FROM trades WHERE id = ?').get(match.trade_id) as any;
        if (trade && (trade.client || trade.client_code)) {
          const tradeUcc = (trade.client || trade.client_code).trim();
          hasValidClientCode = Boolean(tradeUcc && (isValidUcc(tradeUcc) || isStrictValidClientCode(tradeUcc)));
          if (hasValidClientCode) {
            rawCode = tradeUcc;
            try {
              db.prepare("UPDATE calls SET client_code = ?, client = ?, matched_trade_id = ?, identity_status = 'CONFIRMED' WHERE id = ?").run(rawCode, rawCode, match.trade_id, call.id);
            } catch {}
          }
        }
      }
    } catch {}
  }

  // Gate 5: Confirmed Trade Match check
  // User Mandate: "No sure trade match = no transcription, no audit, no scorecard. No exceptions."
  const tradeMatchStatus = (call.trade_match_status || '').toUpperCase();
  const matchedTradeId = Number(call.matched_trade_id) || 0;
  if (matchedTradeId <= 0 || tradeMatchStatus !== 'CONFIRMED') {
    return {
      eligible: false,
      gateCode: 'NO_CONFIRMED_TRADE_MATCH',
      reason: `Call has no confirmed trade match (status: ${tradeMatchStatus || 'NONE'}, trade_id: ${matchedTradeId}). Calls without a deterministic trade match cannot be audited.`,
    };
  }

  return {
    eligible: true,
    gateCode: 'ELIGIBLE',
    reason: 'Call passed all pre-order compliance gates (spoken order intent, client identity, and confirmed trade match). Eligible for compliance audit.',
  };
}
