// =============================================================
// Stage 5: EXACT MULTI-EXECUTION TRADE MATCHING
// Only PRE_ORDER calls are processed in this stage.
//
// Refactored per SEBI Audit:
// Correlation unit is: "one call -> one client/UCC -> all relevant
// executed trades for that client/order conversation."
// Supports single or multiple orders with split executions.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { stage5MultiExecutionMatch, type MultiOrderMatchResult } from './multiExecutionMatcher';
import type { TradeMatchDecision } from './types';

export function syncMatchRecord(
  db: DatabaseSync,
  callId: number,
  tradeId: number,
  confidence: number,
  margin: number,
  reason: string,
  status: string
): void {
  try {
    const tableCols = new Set((db.prepare('PRAGMA table_info(matches)').all() as any[]).map((c) => c.name));
    if (tableCols.size === 0) return;

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const existing = db.prepare('SELECT id FROM matches WHERE call_id = ? AND trade_id = ?').get(callId, tradeId) as { id: number } | undefined;
    const matchStatus = status === 'CONFIRMED' ? 'matched' : status === 'REVIEW' ? 'review' : 'unmatched';

    const statusCol = tableCols.has('status') ? 'status' : tableCols.has('match_status') ? 'match_status' : null;
    const reasonCol = tableCols.has('reason') ? 'reason' : tableCols.has('reasons') ? 'reasons' : null;

    if (existing) {
      const updateParts = ['confidence = ?', 'updated_at = ?'];
      const vals: any[] = [confidence, now];
      if (statusCol) {
        updateParts.push(`${statusCol} = ?`);
        vals.push(matchStatus);
      }
      if (reasonCol) {
        updateParts.push(`${reasonCol} = ?`);
        vals.push(reason);
      }
      if (tableCols.has('score_margin')) {
        updateParts.push('score_margin = ?');
        vals.push(margin);
      }
      if (tableCols.has('verification_status')) {
        updateParts.push('verification_status = ?');
        vals.push('confirmed');
      }
      vals.push(existing.id);
      db.prepare(`UPDATE matches SET ${updateParts.join(', ')} WHERE id = ?`).run(...vals);
    } else {
      const insertCols = ['call_id', 'trade_id', 'confidence', 'created_at', 'updated_at'];
      const insertVals: any[] = [callId, tradeId, confidence, now, now];
      if (statusCol) {
        insertCols.push(statusCol);
        insertVals.push(matchStatus);
      }
      if (reasonCol) {
        insertCols.push(reasonCol);
        insertVals.push(reason);
      }
      if (tableCols.has('second_confidence')) {
        insertCols.push('second_confidence');
        insertVals.push(Math.max(0, confidence - margin));
      }
      if (tableCols.has('score_margin')) {
        insertCols.push('score_margin');
        insertVals.push(margin);
      }
      if (tableCols.has('verification_status')) {
        insertCols.push('verification_status');
        insertVals.push('confirmed');
      }
      if (tableCols.has('manual_override')) {
        insertCols.push('manual_override');
        insertVals.push(0);
      }
      const placeholders = insertCols.map(() => '?').join(', ');
      db.prepare(`INSERT INTO matches (${insertCols.join(', ')}) VALUES (${placeholders})`).run(...insertVals);
    }
  } catch (err: any) {
    console.warn(`[TradeMatcher] Failed to sync match record for call #${callId}:`, err?.message);
  }
}

export function stage5MatchTrade(
  db: DatabaseSync,
  callId: number
): TradeMatchDecision & { multiExecution?: MultiOrderMatchResult } {
  const result = stage5MultiExecutionMatch(db, callId);

  // Synchronize matches table for dashboard correlation metrics & Matching View
  if (result.primary_trade_id && result.status !== 'NO_MATCH') {
    syncMatchRecord(db, callId, result.primary_trade_id, result.confidence, result.margin, result.reason, result.status);
  }
  if (result.matched_trade_ids && result.matched_trade_ids.length > 0) {
    for (const tid of result.matched_trade_ids) {
      if (tid !== result.primary_trade_id) {
        syncMatchRecord(db, callId, tid, result.confidence, result.margin, result.reason, result.status);
      }
    }
  }

  return {
    status: result.status,
    matched_trade_id: result.primary_trade_id,
    confidence: result.confidence,
    margin: result.margin,
    matching_factors: result.matching_factors,
    reason: result.reason,
    multiExecution: result,
  };
}
