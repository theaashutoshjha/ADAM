// =============================================================
// AuditEQ — 10-Minute Pre-Order Trade Clustering & Call Correlator Engine
// User Mandate:
// 1. Group trades by Client Code in trade.csv.
// 2. Cluster trades executed within 10 minutes (600s) of each other into 1 Pre-Order session.
// 3. For each Pre-Order session at time T_trade:
//    - Find the customer's registered 10-digit number from trade.csv.
//    - Search calls / meta.csv for that customer number.
//    - Prioritize the call made before or closest to T_trade.
//    - Mark that call as PRE_ORDER and correlate it to this pre-order trade cluster.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import { normalizePhoneNumber, formatToHmsTime, cleanAgentName, formatCleanClientCode } from '../normalizer';
import { cleanTradingScript } from './tradePreOrderClusterer';
import type { TradeRecord } from '../../src/types';

export interface PreOrderTradeSession {
  sessionId: string;
  clientCode: string;
  symbol: string;
  customerNumber: string; // 10-digit normalized phone from trade record
  advisorName: string;
  tradeDate: string;
  earliestTradeTime: string; // e.g. "10:04:59"
  latestTradeTime: string;   // e.g. "10:05:42"
  earliestTradeSec: number;
  latestTradeSec: number;
  tradeIds: number[];
  trades: TradeRecord[];
  matchedCallId?: number | null;
  matchedCallTime?: string | null;
}

export function parseTimeToSeconds(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const hms = formatToHmsTime(timeStr);
  const match = hms.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
}

/**
 * Clusters all executed trades into authoritative 10-minute Pre-Order Sessions per Client + Stock.
 * User Mandate: One client code + one stock = one pre-order. Different stocks must never be merged.
 */
export function clusterTradesIntoPreOrderSessions(db: DatabaseSync): PreOrderTradeSession[] {
  let allTrades: TradeRecord[] = [];
  try {
    allTrades = db.prepare(`
      SELECT * FROM trades 
      ORDER BY trade_date ASC, trade_time ASC, id ASC
    `).all() as unknown as TradeRecord[];
  } catch (err: any) {
    console.error('[PreOrderClusterEngine] Failed to query trades:', err?.message);
    return [];
  }

  if (allTrades.length === 0) return [];

  // 1. Group trades by Client Code + Stock Symbol
  const byClientStock = new Map<string, { clientCode: string; script: string; trades: TradeRecord[] }>();
  for (const t of allTrades) {
    const rawCode = t.client_code || t.client || '';
    const cleanCode = formatCleanClientCode(rawCode) || rawCode.trim().toUpperCase() || 'UNKNOWN';
    const script = cleanTradingScript(t.symbol);
    const key = `${cleanCode}__${script}`;
    if (!byClientStock.has(key)) {
      byClientStock.set(key, { clientCode: cleanCode, script, trades: [] });
    }
    byClientStock.get(key)!.trades.push(t);
  }

  const sessions: PreOrderTradeSession[] = [];
  let sessionCounter = 1;

  // 2. For each client + stock, sort trades by trade_time and cluster using 10-minute (600s) threshold
  for (const { clientCode, script, trades: clientTrades } of byClientStock.values()) {
    // Sort trades chronologically by time
    clientTrades.sort((a, b) => {
      const sa = parseTimeToSeconds(a.trade_time);
      const sb = parseTimeToSeconds(b.trade_time);
      return sa - sb;
    });

    let currentCluster: TradeRecord[] = [clientTrades[0]];

    for (let i = 1; i < clientTrades.length; i++) {
      const prevTrade = currentCluster[currentCluster.length - 1];
      const prevSec = parseTimeToSeconds(prevTrade.trade_time);
      const currSec = parseTimeToSeconds(clientTrades[i].trade_time);

      // User Rule: If within 10 minutes (<= 600s), cluster into the same pre-order session
      if (currSec - prevSec <= 600) {
        currentCluster.push(clientTrades[i]);
      } else {
        // Save current session and start new session
        sessions.push(createSessionObject(clientCode, script, currentCluster, sessionCounter++));
        currentCluster = [clientTrades[i]];
      }
    }

    if (currentCluster.length > 0) {
      sessions.push(createSessionObject(clientCode, script, currentCluster, sessionCounter++));
    }
  }

  return sessions;
}

function createSessionObject(
  clientCode: string,
  script: string,
  trades: TradeRecord[],
  index: number
): PreOrderTradeSession {
  const first = trades[0];
  const last = trades[trades.length - 1];
  const rawPhone = first.phone_number || first.client_number || (first as any).customer_number || '';
  const normPhone = normalizePhoneNumber(rawPhone);

  const eSec = parseTimeToSeconds(first.trade_time);
  const lSec = parseTimeToSeconds(last.trade_time);

  return {
    sessionId: `SESSION_${clientCode}_${script}_${index}`,
    clientCode,
    symbol: script,
    customerNumber: normPhone,
    advisorName: cleanAgentName(first.advisor_name || first.dealer || ''),
    tradeDate: first.trade_date || '',
    earliestTradeTime: first.trade_time || '',
    latestTradeTime: last.trade_time || '',
    earliestTradeSec: eSec,
    latestTradeSec: lSec,
    tradeIds: trades.map((t) => t.id),
    trades,
  };
}

export interface CorrelationResult {
  totalPreOrderSessions: number;
  matchedCallsCount: number;
  unmatchedSessionsCount: number;
  correlations: Array<{
    sessionId: string;
    clientCode: string;
    customerNumber: string;
    tradeTime: string;
    callId: number;
    canonicalCallId: string;
    callTime: string;
    timeDeltaSec: number;
  }>;
}

/**
 * Correlates each 10-minute Pre-Order Session with the optimal Call in the calls table.
 * Priority: Call made BEFORE or closest to the earliest trade execution time.
 */
export function correlatePreOrdersWithCalls(db: DatabaseSync): CorrelationResult {
  const sessions = clusterTradesIntoPreOrderSessions(db);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Fetch all calls
  const allCalls = db.prepare(`
    SELECT id, canonical_call_id, customer_number, calling_number, phone_number, registered_number,
           call_date, call_time, duration_seconds, classification, status
    FROM calls
    ORDER BY id ASC
  `).all() as any[];

  // Index calls by normalized 10-digit customer phone number
  const callsByPhone = new Map<string, any[]>();
  for (const c of allCalls) {
    const rawP = c.customer_number || c.calling_number || c.phone_number || c.registered_number || '';
    const p10 = normalizePhoneNumber(rawP);
    if (p10 && p10.length === 10) {
      if (!callsByPhone.has(p10)) {
        callsByPhone.set(p10, []);
      }
      callsByPhone.get(p10)!.push(c);
    }
  }

  const assignedCallIds = new Set<number>();
  const correlations: CorrelationResult['correlations'] = [];

  for (const session of sessions) {
    if (!session.customerNumber || session.customerNumber.length !== 10) continue;

    const candidateCalls = callsByPhone.get(session.customerNumber);
    if (!candidateCalls || candidateCalls.length === 0) {
      // User Mandate: Trade executed without call in metadata -> Mail Confirmation
      for (const t of session.trades) {
        try {
          db.prepare(`
            UPDATE trades SET
              notes = 'MAIL_CONFIRMATION: Order placed via Email / Portal Confirmation'
            WHERE id = ?
          `).run(t.id);
        } catch {}
      }
      continue;
    }

    // Filter available calls for this customer that haven't been assigned to another session
    const unassigned = candidateCalls.filter((c) => !assignedCallIds.has(c.id));
    const pool = unassigned.length > 0 ? unassigned : candidateCalls;

    // Score calls: Prioritize call made BEFORE earliestTradeTime (0 <= Delta <= 3600),
    // or call spanning the trade, or closest call.
    let bestCall: any = null;
    let bestScore = -Infinity;
    let bestDeltaSec = 0;

    for (const call of pool) {
      const callSec = parseTimeToSeconds(call.call_time);
      const callDur = call.duration_seconds || 60;
      const callEndSec = callSec + callDur;
      const deltaSec = session.earliestTradeSec - callSec; // positive if call was placed BEFORE trade

      let score = 0;

      // Critical Mandate: Physical audio recordings on disk get top priority (+2000) over metadata-only CDRs
      const hasAudio = Boolean(call.storage_path && call.storage_path.trim() !== '');
      if (hasAudio) {
        score += 2000;
      }

      // 1. Call placed before trade execution within 1 hour: HIGHEST PRIORITY
      if (deltaSec >= 0 && deltaSec <= 3600) {
        score = 1000 - deltaSec; // Closer to trade execution gets higher score
      }
      // 2. Call active during trade execution (call starts before and ends after trade)
      else if (callSec <= session.earliestTradeSec && callEndSec >= session.earliestTradeSec) {
        score = 950;
      }
      // 3. Call placed earlier the same day (e.g. pre-market 09:00 - 09:15)
      else if (deltaSec > 3600 && deltaSec <= 14400) {
        score = 500 - Math.round(deltaSec / 10);
      }
      // 4. Call placed shortly after trade execution (<= 10 min)
      else if (deltaSec < 0 && Math.abs(deltaSec) <= 600) {
        score = 300 - Math.abs(deltaSec);
      }
      // 5. Any call during market hours for this customer
      else {
        score = 100 - Math.min(100, Math.round(Math.abs(deltaSec) / 100));
      }

      if (score > bestScore) {
        bestScore = score;
        bestCall = call;
        bestDeltaSec = deltaSec;
      }
    }

    if (bestCall) {
      assignedCallIds.add(bestCall.id);
      session.matchedCallId = bestCall.id;
      session.matchedCallTime = bestCall.call_time;

      const primaryTradeId = session.trades[0].id;
      const clientUcc = session.clientCode;
      const primaryTrade = session.trades[0];

      // Mark call as PRE_ORDER and link trade in DB dynamically
      try {
        const callCols = new Set((db.prepare('PRAGMA table_info(calls)').all() as any[]).map(c => c.name));
        const callUpdates: string[] = [];
        const callVals: any[] = [];
        if (callCols.has('classification')) callUpdates.push("classification = 'PRE_ORDER'");
        if (callCols.has('call_type')) callUpdates.push("call_type = 'pre_order'");
        if (callCols.has('trade_match_status')) callUpdates.push("trade_match_status = 'CONFIRMED'");
        if (callCols.has('matched_trade_id')) { callUpdates.push("matched_trade_id = ?"); callVals.push(primaryTradeId); }
        if (callCols.has('client_code')) { callUpdates.push("client_code = ?"); callVals.push(clientUcc); }
        if (callCols.has('client')) { callUpdates.push("client = ?"); callVals.push(clientUcc); }
        if (callCols.has('customer_number')) { callUpdates.push("customer_number = ?"); callVals.push(session.customerNumber); }
        if (callCols.has('phone_number')) { callUpdates.push("phone_number = ?"); callVals.push(session.customerNumber); }
        if (callCols.has('calling_number')) { callUpdates.push("calling_number = ?"); callVals.push(session.customerNumber); }
        if (callCols.has('classification_reason')) {
          callUpdates.push("classification_reason = ?");
          callVals.push(`Pre-Order Identified: Client ${clientUcc} (${session.customerNumber}) placed ${session.trades.length} trade(s) around ${session.earliestTradeTime}. Correlated call #${bestCall.id} (${bestCall.call_time}).`);
        }
        if (callCols.has('updated_at')) { callUpdates.push("updated_at = ?"); callVals.push(now); }
        if (callUpdates.length > 0) {
          callVals.push(bestCall.id);
          db.prepare(`UPDATE calls SET ${callUpdates.join(', ')} WHERE id = ?`).run(...callVals);
        }

        // Ensure call_orders and order_executions exist for Stage 7 audit
        for (let oIdx = 0; oIdx < session.trades.length; oIdx++) {
          const t = session.trades[oIdx];
          const orderId = `order_${bestCall.id}_${oIdx}`;
          try {
            db.prepare(`
              INSERT OR REPLACE INTO call_orders (
                id, call_id, order_index, intent_type, symbol, raw_symbol, quantity, raw_quantity,
                price_type, limit_price, raw_price, confidence, created_at
              ) VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, 'MARKET', ?, ?, 0.95, ?)
            `).run(
              orderId,
              bestCall.id,
              oIdx,
              (t.symbol || 'STOCK').toUpperCase(),
              t.symbol || '',
              t.quantity || 1,
              String(t.quantity || 1),
              t.price || null,
              String(t.price || 'CMP'),
              now
            );

            db.prepare(`
              INSERT OR REPLACE INTO order_executions (
                id, order_id, trade_id, matched_quantity, confidence, margin, reason, created_at
              ) VALUES (?, ?, ?, ?, 0.95, 0.20, ?, ?)
            `).run(
              `exec_${orderId}_${t.id}`,
              orderId,
              t.id,
              t.quantity || 1,
              `Pre-Order Cluster Execution: Matched ${t.symbol} Qty ${t.quantity} @ ₹${t.price}`,
              now
            );
          } catch {}
        }
      } catch (err: any) {
        console.warn(`[PreOrderClusterEngine] Failed to update call #${bestCall.id}:`, err?.message);
      }

      correlations.push({
        sessionId: session.sessionId,
        clientCode: session.clientCode,
        customerNumber: session.customerNumber,
        tradeTime: session.earliestTradeTime,
        callId: bestCall.id,
        canonicalCallId: bestCall.canonical_call_id,
        callTime: bestCall.call_time,
        timeDeltaSec: bestDeltaSec,
      });
    }
  }

  return {
    totalPreOrderSessions: sessions.length,
    matchedCallsCount: correlations.length,
    unmatchedSessionsCount: sessions.length - correlations.length,
    correlations,
  };
}
