// =============================================================
// ADAM-AR Multi-Execution & Order Intent Matching Engine
//
// Core Architecture:
// The correlation unit is NOT "one call -> one trade."
// It is "one call -> one client/UCC -> all relevant executed trades
// for that client/order conversation."
//
// Key Principles:
// 1. One call can legitimately result in multiple executions/fills/trades.
// 2. One call can contain multiple distinct orders (e.g. BUY 100 TCS & BUY 50 INFY).
// 3. Execution grouping: A client order for 1000 Welspun Living can be filled as
//    300 + 500 + 200 shares. All 3 trades belong to this single call order.
// 4. Time, side, quantity, price/CMP, and client UCC must strictly anchor the match.
// 5. Missing trades for an order conversation -> REGULAR call (order without trade).
// 6. Ambiguous / competing executions -> REVIEW.
// 7. Persist to call_orders and order_executions tables.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import type { CallRecord, TradeRecord } from '../../src/types';
import {
  normalizeClientCode,
  formatCleanClientCode,
  normalizePhoneNumber,
  comparePhoneNumbers,
  compareAdvisorNames,
  cleanAgentName,
  normalizeSpokenNumbers,
  normalizeOrderSide,
  matchSymbolInTranscript,
  SYMBOL_ALIASES,
  normalizeToIsoDate,
  mentionsMarketPriceOrCMP,
} from '../normalizer';
import { parseTradeSecondsFromMidnight } from './tradePreOrderClusterer';

export interface ExtractedCallOrder {
  id: string;
  call_id: number;
  order_index: number;
  intent_type: 'BUY' | 'SELL' | 'CANCEL' | 'MODIFY';
  symbol: string | null;
  raw_symbol: string | null;
  quantity: number | null;
  raw_quantity: string | null;
  price_type: 'CMP' | 'LIMIT' | 'MARKET' | null;
  limit_price: number | null;
  raw_price: string | null;
  confidence: number;
}

export interface MatchedExecution {
  id: string;
  order_id: string;
  trade_id: number;
  trade: TradeRecord;
  matched_quantity: number;
  confidence: number;
  margin: number;
  reason: string;
}

export interface MultiOrderMatchResult {
  status: 'CONFIRMED' | 'REVIEW' | 'NO_MATCH';
  clientConfirmed: boolean;
  orders: Array<ExtractedCallOrder & {
    executions: MatchedExecution[];
    totalExecutedQuantity: number;
    executionStatus: 'CONFIRMED' | 'PARTIAL' | 'REVIEW' | 'NO_MATCH';
  }>;
  matched_trade_ids: number[];
  primary_trade_id: number | null;
  confidence: number;
  margin: number;
  matching_factors: string[];
  reason: string;
}

const NON_STOCK_WORDS = new Set([
  'THE', 'AND', 'FOR', 'BUY', 'SELL', 'CMP', 'LTP', 'NSE', 'BSE', 'CALL', 'PUT', 'PRICE',
  'LIMIT', 'MARKET', 'ORDER', 'ORDERS', 'TRADE', 'TRADES', 'SHARES', 'SHARE', 'QUANTITY', 'STOCK', 'CLIENT',
  'CODE', 'YES', 'NO', 'OKAY', 'PLEASE', 'RATE', 'RS', 'INR', 'LOTS', 'LOT', 'GOOD', 'MORNING',
  'TODAY', 'CONFIRM', 'CONFIRMED', 'CURRENT', 'HELLO', 'SIR', 'MADAM', 'DEALER', 'ADVISOR',
  'WAG', 'WIG', 'VIA', 'WIA', 'WIF', 'WIC', 'WID', 'WIE', 'FIA', 'PWD', 'UCC', 'DEMAT', 'ACCOUNT',
  'FUNDSINDIA', 'FUNDS', 'INDIA',
  'MTF', 'LTM', 'GTC', 'GPS', 'CNC', 'MIS', 'NRML', 'AMO', 'SL', 'SLM', 'PE', 'CE', 'EQ', 'FO',
  'MARGIN', 'DELIVERY', 'INTRADAY', 'HOLDING', 'HOLDINGS', 'PROFIT', 'LOSS', 'BROKER', 'BROKERAGE'
]);

/**
 * Extracts order intents from the call transcript.
 * Recognizes action (BUY/SELL), symbol, quantity, price/CMP.
 */
export function extractOrdersFromTranscript(
  callId: number,
  transcript: string
): ExtractedCallOrder[] {
  if (!transcript || transcript.trim().length === 0) return [];

  const orders: ExtractedCallOrder[] = [];
  const normalizedSpoken = normalizeSpokenNumbers(transcript);

  // Identify symbol candidates mentioned in conversation
  const detectedSymbols: Array<{ symbol: string; rawText: string; index: number }> = [];

  for (const [baseSymbol, aliases] of Object.entries(SYMBOL_ALIASES)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      let m;
      while ((m = re.exec(transcript)) !== null) {
        if (!detectedSymbols.some((s) => s.symbol === baseSymbol)) {
          detectedSymbols.push({ symbol: baseSymbol, rawText: m[0], index: m.index });
        }
      }
    }
  }

  // Also check direct NSE uppercase symbols in transcript
  const wordTokens = transcript.match(/\b[A-Z]{3,12}\b/g) || [];
  for (const token of wordTokens) {
    if (!NON_STOCK_WORDS.has(token)) {
      const match = matchSymbolInTranscript(token, transcript);
      if (match.matched && !detectedSymbols.some((s) => s.symbol === token)) {
        detectedSymbols.push({ symbol: token, rawText: token, index: transcript.indexOf(token) });
      }
    }
  }

  // Deduplicate overlapping symbol matches (e.g. "Welspun Living" vs "Welspun")
  const deduplicatedSymbols: Array<{ symbol: string; rawText: string; index: number }> = [];
  const sortedByLength = [...detectedSymbols].sort((a, b) => b.rawText.length - a.rawText.length);
  for (const item of sortedByLength) {
    const itemStart = item.index;
    const itemEnd = item.index + item.rawText.length;
    const overlaps = deduplicatedSymbols.some(
      (existing) => Math.max(itemStart, existing.index) < Math.min(itemEnd, existing.index + existing.rawText.length)
    );
    if (!overlaps) {
      deduplicatedSymbols.push(item);
    }
  }

  // Sort detected symbols by appearance order in transcript
  deduplicatedSymbols.sort((a, b) => a.index - b.index);

  // If specific symbols detected, construct order objects around each symbol context
  if (deduplicatedSymbols.length > 0) {
    for (let orderIndex = 0; orderIndex < deduplicatedSymbols.length; orderIndex++) {
      const symInfo = deduplicatedSymbols[orderIndex];
      const prevEnd = orderIndex > 0 ? (deduplicatedSymbols[orderIndex - 1].index + deduplicatedSymbols[orderIndex - 1].rawText.length) : 0;
      const nextStart = orderIndex < deduplicatedSymbols.length - 1 ? deduplicatedSymbols[orderIndex + 1].index : transcript.length;

      // Bound window cleanly around this order's symbol
      const start = Math.max(prevEnd, symInfo.index - 80);
      const end = Math.min(nextStart, symInfo.index + symInfo.rawText.length + 80);
      const windowText = transcript.slice(start, end);
      const windowSpoken = normalizedSpoken.slice(start, end);

      // Determine Side (BUY / SELL) closest to symbol
      const buyRegex = /\b(?:buy|khareed|purchase|long)\b/gi;
      const sellRegex = /\b(?:sell|bech|becho|nikal|square\s*off|short|exit)\b/gi;

      let intentType: 'BUY' | 'SELL' = 'BUY';
      let minDistance = Infinity;

      let bMatch;
      while ((bMatch = buyRegex.exec(windowText)) !== null) {
        const dist = Math.abs(bMatch.index - (symInfo.index - start));
        if (dist < minDistance) {
          minDistance = dist;
          intentType = 'BUY';
        }
      }

      let sMatch;
      while ((sMatch = sellRegex.exec(windowText)) !== null) {
        const dist = Math.abs(sMatch.index - (symInfo.index - start));
        if (dist < minDistance) {
          minDistance = dist;
          intentType = 'SELL';
        }
      }

      // Determine Price Type
      let priceType: 'CMP' | 'LIMIT' | 'MARKET' = 'MARKET';
      let limitPrice: number | null = null;
      let rawPrice: string | null = null;

      if (/\b(?:cmp|current\s+market\s+price|market\s+price|at\s+market|market\s+pe|rate\s+pe)\b/i.test(windowText)) {
        priceType = 'CMP';
        rawPrice = 'CMP';
      } else {
        const priceMatch = windowSpoken.match(/\b(?:price|rate|at|rs\.?|inr|bhav|@)\s*[:\-]?\s*(\d+(?:\.\d{1,2})?)\b/i);
        if (priceMatch) {
          limitPrice = parseFloat(priceMatch[1]);
          rawPrice = priceMatch[1];
          priceType = 'LIMIT';
        }
      }

      // Determine Quantity closest to symbol, avoiding price numbers
      let quantity: number | null = null;
      let rawQuantity: string | null = null;

      // Prefer numbers with explicit quantity keywords (shares, share, qty, quantity, lots, units) or directly after buy/sell/exit
      const explicitQtyRegex = /\b(?:buy|sell|purchase|exit|quantity|qty)\s+(\d{1,6})\b|\b(\d{1,6})\s*(?:shares|share|quantity|qty|lots|units)\b/gi;
      let eqMatch;
      let minExplicitDist = Infinity;
      while ((eqMatch = explicitQtyRegex.exec(windowSpoken)) !== null) {
        const valStr = eqMatch[1] || eqMatch[2];
        const parsed = parseInt(valStr, 10);
        if (parsed > 0 && parsed !== limitPrice) {
          const dist = Math.abs(eqMatch.index - (symInfo.index - start));
          if (dist < minExplicitDist) {
            minExplicitDist = dist;
            quantity = parsed;
            rawQuantity = valStr;
          }
        }
      }

      // If no explicit keyword matched, look for any integer in window that isn't the price
      if (!quantity) {
        const genericNumRegex = /\b(\d{1,6})\b/g;
        let gm;
        let minGenDist = Infinity;
        while ((gm = genericNumRegex.exec(windowSpoken)) !== null) {
          const parsed = parseInt(gm[1], 10);
          if (parsed > 0 && parsed !== limitPrice) {
            const prefixSlice = windowSpoken.slice(Math.max(0, gm.index - 10), gm.index);
            if (!/\b(?:at|rs|inr|@|price|rate)\s*$/i.test(prefixSlice)) {
              const dist = Math.abs(gm.index - (symInfo.index - start));
              if (dist < minGenDist) {
                minGenDist = dist;
                quantity = parsed;
                rawQuantity = gm[1];
              }
            }
          }
        }
      }

      orders.push({
        id: `order_${callId}_${orderIndex}`,
        call_id: callId,
        order_index: orderIndex,
        intent_type: intentType,
        symbol: symInfo.symbol,
        raw_symbol: symInfo.rawText,
        quantity,
        raw_quantity: rawQuantity,
        price_type: priceType,
        limit_price: limitPrice,
        raw_price: rawPrice,
        confidence: 0.90,
      });
    }
  }

  // Fallback: If no known symbol alias matched but BUY/SELL + quantity exists
  if (orders.length === 0) {
    const actionMatch = transcript.match(/\b(buy|sell)\b/i);
    if (actionMatch) {
      const intentType = actionMatch[1].toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const numMatch = normalizedSpoken.match(/\b(\d{1,6})\s*(?:shares|share|quantity|qty)?\b/i);
      const isCmp = /\b(?:cmp|current\s+market\s+price|market\s+price|at\s+market)\b/i.test(transcript);

      orders.push({
        id: `order_${callId}_0`,
        call_id: callId,
        order_index: 0,
        intent_type: intentType,
        symbol: null,
        raw_symbol: null,
        quantity: numMatch ? parseInt(numMatch[1], 10) : null,
        raw_quantity: numMatch ? numMatch[1] : null,
        price_type: isCmp ? 'CMP' : 'MARKET',
        limit_price: null,
        raw_price: isCmp ? 'CMP' : null,
        confidence: 0.70,
      });
    }
  }

  return orders;
}

/**
 * Stage 5 Multi-Execution Matcher:
 * Correlates a single call with one or more executed trades for the resolved client.
 */
export function stage5MultiExecutionMatch(
  db: DatabaseSync,
  callId: number
): MultiOrderMatchResult {
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found.`);
  }

  // SCRAP guard
  const callClassification = (call.classification || call.call_type || '').toUpperCase();
  if (callClassification === 'SCRAP') {
    return {
      status: 'NO_MATCH',
      clientConfirmed: false,
      orders: [],
      matched_trade_ids: [],
      primary_trade_id: null,
      confidence: 0,
      margin: 0,
      matching_factors: [],
      reason: 'Call is classified as SCRAP. Excluded from trade matching.',
    };
  }

  // 1. Extract Order Intents from Transcript
  const transcript = call.transcript || '';
  const extractedOrders = extractOrdersFromTranscript(callId, transcript);

  // 2. Identify Client & Advisor Filter Criteria
  // Rules 5, 6, 7:
  // Call Metadata Col E (Customer Number, last 10 digits) <-> Trade Report Col F (Number / Customer Number, last 10 digits)
  // AND
  // Call Metadata Col J (Answered By Agent) <-> Trade Report Col B (Advisor Name, normalized)
  let clientUcc = normalizeClientCode(call.client_code || call.client);
  if (!clientUcc && transcript) {
    const uccMatch = transcript.match(/\b([A-Z]{3,4}\s*\d{4,6})\b/i) || transcript.match(/\b(P?W[I1][A-Z0-9]\s*\d{4,6})\b/i);
    if (uccMatch) {
      clientUcc = normalizeClientCode(uccMatch[1]);
    }
  }
  const rawCallerPhone = call.calling_number || call.phone_number || (call as any).customer_number || '';
  const callerPhone = normalizePhoneNumber(rawCallerPhone);
  const callerPhone10 = callerPhone.length >= 10 ? callerPhone.slice(-10) : callerPhone;
  const callAdvisor = cleanAgentName(call.caller_name || (call as any).advisor_name || (call as any).dealer || '');

  let candidateTrades: TradeRecord[] = [];
  try {
    let rawTrades: TradeRecord[] = [];
    if (callerPhone10 && clientUcc) {
      rawTrades = db.prepare(`
        SELECT * FROM trades 
        WHERE client = ? OR client_number = ? OR phone_number = ? OR client_number LIKE ? OR phone_number LIKE ?
        ORDER BY id ASC
      `).all(clientUcc, callerPhone10, callerPhone10, `%${callerPhone10}`, `%${callerPhone10}`) as unknown as TradeRecord[];
    } else if (callerPhone10) {
      rawTrades = db.prepare(`
        SELECT * FROM trades 
        WHERE client_number = ? OR phone_number = ? OR client_number LIKE ? OR phone_number LIKE ?
        ORDER BY id ASC
      `).all(callerPhone10, callerPhone10, `%${callerPhone10}`, `%${callerPhone10}`) as unknown as TradeRecord[];
    } else if (clientUcc) {
      rawTrades = db.prepare(`
        SELECT * FROM trades 
        WHERE client = ? OR client_code = ?
        ORDER BY id ASC
      `).all(clientUcc, clientUcc) as unknown as TradeRecord[];
    }

    // Filter candidate trades by Customer Number (last 10 digits) AND Advisor Name
    for (const trade of rawTrades) {
      const tradePhoneRaw = trade.client_number || trade.phone_number || (trade as any).customer_number || '';
      const tradePhone = normalizePhoneNumber(tradePhoneRaw);
      const phoneMatches = callerPhone10
        ? comparePhoneNumbers(callerPhone10, tradePhone)
        : Boolean(clientUcc && (trade.client === clientUcc || (trade as any).client_code === clientUcc));

      if (!phoneMatches) continue;

      // Multi-Day Date Alignment: Compare call date and trade date if both are specified
      const callDateIso = normalizeToIsoDate(call.call_date || (call.created_at ? call.created_at.slice(0, 10) : ''));
      const tradeDateIso = normalizeToIsoDate(trade.trade_date || trade.order_date || '');
      if (callDateIso && tradeDateIso && callDateIso !== tradeDateIso) {
        // Different trading dates in multi-day dataset
        continue;
      }

      const tradeAdvisor = trade.advisor_name || trade.dealer || (trade as any).dealer_name || '';
      const callDealer = (call.dealer || (call as any).dealer_name || '').trim().toUpperCase();
      const tradeDealer = (trade.dealer || (trade as any).dealer_name || '').trim().toUpperCase();
      const dealerCodeMatches = Boolean(callDealer && tradeDealer && callDealer === tradeDealer);
      if (callAdvisor && tradeAdvisor && !dealerCodeMatches) {
        if (!compareAdvisorNames(callAdvisor, tradeAdvisor)) {
          // Do not use a trade belonging to another advisor
          continue;
        }
      }

      candidateTrades.push(trade);
    }
  } catch {
    candidateTrades = [];
  }

  if (candidateTrades.length === 0) {
    return {
      status: 'NO_MATCH',
      clientConfirmed: Boolean(clientUcc),
      orders: extractedOrders.map((o) => ({
        ...o,
        executions: [],
        totalExecutedQuantity: 0,
        executionStatus: 'NO_MATCH',
      })),
      matched_trade_ids: [],
      primary_trade_id: null,
      confidence: 0,
      margin: 0,
      matching_factors: [],
      reason: `No trades found matching Customer Number (${callerPhone10 || 'none'}) and Advisor (${callAdvisor || 'none'}).`,
    };
  }

  // 3. Correlate Executions with Orders
  const matchedTradeIds = new Set<number>();
  const factors: string[] = [];
  const processedOrders: MultiOrderMatchResult['orders'] = [];

  // Group candidate trades by symbol and side
  for (const order of extractedOrders) {
    const matchingTradesForOrder: MatchedExecution[] = [];
    let orderExecutedQty = 0;

    // Sort candidate trades so that trades executed during the call or closest after call start are evaluated first
    const callSec = call.call_time ? (() => {
      const [ch, cm, cs] = call.call_time.split(':').map(Number);
      return !isNaN(ch) ? ch * 3600 + (cm || 0) * 60 + (cs || 0) : null;
    })() : null;

    const sortedCandidateTrades = [...candidateTrades].sort((a, b) => {
      if (callSec === null) return 0;
      const getTradeSec = (t: TradeRecord) => {
        if (!t.trade_time) return 999999;
        const [th, tm, ts] = t.trade_time.split(':').map(Number);
        return !isNaN(th) ? th * 3600 + (tm || 0) * 60 + (ts || 0) : 999999;
      };
      const aSec = getTradeSec(a);
      const bSec = getTradeSec(b);
      const aDelta = aSec - callSec;
      const bDelta = bSec - callSec;
      const aScore = aDelta >= -60 && aDelta <= 1800 ? 1000 - Math.abs(aDelta) : -Math.abs(aDelta);
      const bScore = bDelta >= -60 && bDelta <= 1800 ? 1000 - Math.abs(bDelta) : -Math.abs(bDelta);
      return bScore - aScore;
    });

    for (const trade of sortedCandidateTrades) {
      if (matchedTradeIds.has(trade.id)) continue; // Don't double-assign to different orders

      // Match symbol
      const tradeSymbol = (trade.symbol || '').toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
      const orderSymbol = (order.symbol || '').toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');

      let symbolMatches = false;
      const baseTradeSymbol = tradeSymbol.replace(/\d{1,2}[A-Z]{3}\d{2,}.*$/, '').trim();
      if (orderSymbol && tradeSymbol) {
        if (orderSymbol === tradeSymbol || (baseTradeSymbol && orderSymbol === baseTradeSymbol) || tradeSymbol.startsWith(orderSymbol)) {
          symbolMatches = true;
        } else {
          // Check aliases for full tradeSymbol and baseTradeSymbol
          const aliases = [
            ...((SYMBOL_ALIASES as Record<string, string[]>)[tradeSymbol] || []),
            ...((SYMBOL_ALIASES as Record<string, string[]>)[baseTradeSymbol] || []),
          ];
          if (aliases.some((a) => a.toUpperCase() === orderSymbol || orderSymbol.includes(a.toUpperCase()))) {
            symbolMatches = true;
          }
        }
      } else if (!orderSymbol) {
        // If order symbol was not explicitly extracted, check if trade symbol is in transcript
        const symMatch = matchSymbolInTranscript(tradeSymbol, transcript).matched
          ? matchSymbolInTranscript(tradeSymbol, transcript)
          : (baseTradeSymbol ? matchSymbolInTranscript(baseTradeSymbol, transcript) : { matched: false });
        if (symMatch.matched) {
          symbolMatches = true;
        }
      }

      if (!symbolMatches) continue;

      // Match Side (BUY / SELL)
      const rawSide = trade.side || (trade as any).order_type || (trade as any).side_type || (trade as any).buy_sell || (trade as any).action || '';
      const normSide = rawSide ? normalizeOrderSide(rawSide) : 'UNKNOWN';
      const normTradeSide = (normSide !== 'UNKNOWN' ? normSide : (order.intent_type || 'BUY')).toUpperCase();
      if (order.intent_type && normSide !== 'UNKNOWN' && order.intent_type !== normTradeSide) {
        const qtyMatches = Boolean(order.quantity && Math.abs(order.quantity - (trade.quantity || 0)) <= 1);
        if (!qtyMatches) {
          continue;
        }
      }

      // Check Date (if call_date and trade_date are both present)
      const normCallDate = normalizeToIsoDate(call.call_date);
      const normTradeDate = normalizeToIsoDate(trade.trade_date);
      if (normCallDate && normTradeDate && normCallDate !== normTradeDate) {
        continue;
      }

      // Calculate dynamic execution confidence
      let execConf = 0.0;
      if (orderSymbol && tradeSymbol && orderSymbol === tradeSymbol) execConf += 0.35;
      else execConf += 0.30;

      if (order.intent_type === normTradeSide) execConf += 0.25;

      if (order.quantity && orderExecutedQty === order.quantity) execConf += 0.20;
      else if (order.quantity && orderExecutedQty > 0) execConf += 0.10;
      else execConf += 0.15;

      if (order.price_type === 'CMP') execConf += 0.10;
      else if (order.limit_price && trade.price) {
        const diff = Math.abs(trade.price - order.limit_price) / order.limit_price;
        if (diff <= 0.01) execConf += 0.10;
        else if (diff <= 0.05) execConf += 0.05;
      } else {
        execConf += 0.05;
      }

      if (normCallDate && normTradeDate && normCallDate === normTradeDate) {
        execConf += 0.10;
      }

      // Time correlation: if call_time and trade_time are both available
      if (call.call_time && trade.trade_time) {
        try {
          const [ch, cm, cs] = call.call_time.split(':').map(Number);
          const [th, tm, ts] = trade.trade_time.split(':').map(Number);
          if (!isNaN(ch) && !isNaN(th)) {
            const callSecVal = ch * 3600 + (cm || 0) * 60 + (cs || 0);
            const tradeSec = th * 3600 + (tm || 0) * 60 + (ts || 0);
            const deltaSec = tradeSec - callSecVal;
            // Pre-order trade must not occur >60s BEFORE call or >2 hours AFTER call
            if (deltaSec < -60 || deltaSec > 7200) {
              continue;
            }
            if (deltaSec >= 0 && deltaSec <= 300) {
              execConf += 0.20;
            } else if (Math.abs(deltaSec) <= 900) {
              execConf += 0.15;
            } else if (Math.abs(deltaSec) <= 3600) {
              execConf += 0.05;
            }
          }
        } catch {}
      }
      execConf = Math.min(1.0, Math.round(execConf * 100) / 100);

      // Trade matches this order!
      const tradeQty = Math.round(trade.quantity || 0);
      orderExecutedQty += tradeQty;
      matchedTradeIds.add(trade.id);

      matchingTradesForOrder.push({
        id: `exec_${order.id}_${trade.id}`,
        order_id: order.id,
        trade_id: trade.id,
        trade,
        matched_quantity: tradeQty,
        confidence: execConf,
        margin: 0.25,
        reason: `Matched ${trade.symbol} (${normTradeSide}) Qty ${tradeQty} @ ₹${trade.price} to call order #${order.order_index} with confidence ${execConf}.`,
      });

      // 6-Minute Gap Pre-Order Clustering Rule (RULES D-01, window_seconds: 360):
      // If other trades exist for the same client code & stock with time difference <= 6 minutes (360s),
      // they belong to this exact SAME pre-order (partial fills / concurrent executions).
      const tradeSec = parseTradeSecondsFromMidnight(trade.trade_time, trade.trade_date);
      for (const sibTrade of candidateTrades) {
        if (sibTrade.id === trade.id || matchedTradeIds.has(sibTrade.id)) continue;
        const sibSymbol = (sibTrade.symbol || '').toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
        if (sibSymbol === tradeSymbol) {
          const sibSec = parseTradeSecondsFromMidnight(sibTrade.trade_time, sibTrade.trade_date);
          const timeGapSec = Math.abs(tradeSec - sibSec);
          if (timeGapSec <= 360) {
            // Less than or equal to 6 minutes difference -> cluster into the same pre-order!
            const sibQty = Math.round(sibTrade.quantity || 0);
            matchedTradeIds.add(sibTrade.id);
            orderExecutedQty += sibQty;
            matchingTradesForOrder.push({
              id: `exec_${order.id}_${sibTrade.id}`,
              order_id: order.id,
              trade_id: sibTrade.id,
              trade: sibTrade,
              matched_quantity: sibQty,
              confidence: execConf,
              margin: 0.25,
              reason: `Grouped execution (${timeGapSec}s gap <= 6 min per D-01): ${sibTrade.symbol} Qty ${sibQty} @ ₹${sibTrade.price}.`,
            });
          }
        }
      }
    }

    // Determine execution status for this order
    let execStatus: 'CONFIRMED' | 'PARTIAL' | 'REVIEW' | 'NO_MATCH' = 'NO_MATCH';
    if (matchingTradesForOrder.length > 0) {
      if (!order.quantity || orderExecutedQty === order.quantity) {
        execStatus = 'CONFIRMED';
        factors.push(`Order #${order.order_index} (${order.symbol || 'Stock'}): fully executed with ${matchingTradesForOrder.length} fill(s) (total ${orderExecutedQty} shares).`);
      } else if (orderExecutedQty > 0) {
        execStatus = 'PARTIAL';
        factors.push(`Order #${order.order_index} (${order.symbol || 'Stock'}): partially executed (${orderExecutedQty}/${order.quantity} shares across ${matchingTradesForOrder.length} fills).`);
      }
    } else {
      execStatus = 'NO_MATCH';
    }

    processedOrders.push({
      ...order,
      executions: matchingTradesForOrder,
      totalExecutedQuantity: orderExecutedQty,
      executionStatus: execStatus,
    });
  }

  // 4. Overall Match Decision
  const totalOrders = processedOrders.length;
  const confirmedOrders = processedOrders.filter((o) => o.executionStatus === 'CONFIRMED').length;
  const partialOrders = processedOrders.filter((o) => o.executionStatus === 'PARTIAL').length;
  const matchedIds = Array.from(matchedTradeIds);

  let overallStatus: 'CONFIRMED' | 'REVIEW' | 'NO_MATCH' = 'NO_MATCH';
  let overallReason = '';
  let overallConfidence = 0;

  if (totalOrders > 0 && confirmedOrders === totalOrders && matchedIds.length > 0) {
    overallStatus = 'CONFIRMED';
    overallConfidence = 0.95;
    overallReason = `All ${totalOrders} order(s) successfully correlated to ${matchedIds.length} trade execution(s).`;
  } else if ((confirmedOrders > 0 || partialOrders > 0) && matchedIds.length > 0) {
    overallStatus = 'CONFIRMED';
    overallConfidence = 0.85;
    overallReason = `Correlated ${matchedIds.length} trade execution(s) for ${totalOrders} order(s) (confirmed: ${confirmedOrders}, partial: ${partialOrders}).`;
  } else if (candidateTrades.length > 0) {
    // Deterministic trade correlation for pre-order calls whose customer has trades in trade.csv
    let bestTrade: TradeRecord | null = null;
    let bestScore = -1;
    const normTranscript = (transcript || '').toUpperCase();

    for (const trade of candidateTrades) {
      // Time window check: executed trade must fall within pre-order window (-60s to +3600s)
      if (call.call_time && trade.trade_time) {
        try {
          const [ch, cm, cs] = call.call_time.split(':').map(Number);
          const [th, tm, ts] = trade.trade_time.split(':').map(Number);
          if (!isNaN(ch) && !isNaN(th)) {
            const callSec = ch * 3600 + (cm || 0) * 60 + (cs || 0);
            const tradeSec = th * 3600 + (tm || 0) * 60 + (ts || 0);
            const diffSec = tradeSec - callSec;
            if (diffSec < -60 || diffSec > 3600) {
              continue;
            }
          }
        } catch {}
      }

      let score = 0;
      const tradeSymbol = (trade.symbol || '').toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
      const baseTradeSymbol = tradeSymbol.replace(/\d{1,2}[A-Z]{3}\d{2,}.*$/, '').trim();

      // 1. Symbol Match in transcript
      const symMatch = matchSymbolInTranscript(tradeSymbol, transcript).matched
        ? matchSymbolInTranscript(tradeSymbol, transcript)
        : (baseTradeSymbol ? matchSymbolInTranscript(baseTradeSymbol, transcript) : { matched: false });

      let hasSymbolMatch = symMatch.matched;
      if (!hasSymbolMatch) {
        const aliases = [
          ...((SYMBOL_ALIASES as Record<string, string[]>)[tradeSymbol] || []),
          ...((SYMBOL_ALIASES as Record<string, string[]>)[baseTradeSymbol] || []),
        ];
        if (aliases.some(a => normTranscript.includes(a.toUpperCase()))) {
          hasSymbolMatch = true;
        }
      }
      if (hasSymbolMatch) score += 100;

      // Require either symbol match or explicit order context
      const hasOrderContext = hasSymbolMatch || /\b(?:buy|sell|order|shares?|lot|lots|cmp|market\s*price|limit|quantity|price)\b/i.test(normTranscript);
      if (!hasOrderContext) {
        continue;
      }

      // 1.5 Client Code / UCC Match in transcript or against resolved UCC
      const cleanTradeClient = formatCleanClientCode(trade.client || trade.client_code);
      if (cleanTradeClient) {
        if (cleanTradeClient === clientUcc) {
          score += 80;
        } else if (normTranscript.includes(cleanTradeClient)) {
          score += 80;
        } else {
          const digitsMatch = cleanTradeClient.match(/\d{4,6}/);
          if (digitsMatch && normTranscript.includes(digitsMatch[0])) {
            score += 50;
          }
        }
      }

      // 1.6 Price Match in transcript
      if (trade.price) {
        const pStr = String(trade.price);
        const pInt = Math.floor(trade.price);
        if (normTranscript.includes(pStr) || (pInt > 0 && normTranscript.includes(String(pInt))) || mentionsMarketPriceOrCMP(transcript)) {
          score += 40;
        }
      }

      // 1.7 Quantity Match in transcript
      if (trade.quantity) {
        const qStr = String(Math.round(trade.quantity));
        if (normTranscript.includes(qStr)) {
          score += 30;
        }
      }

      // 2. Side Match (BUY / SELL)
      const normTradeSide = normalizeOrderSide(trade.side || '');
      if (normTradeSide !== 'UNKNOWN' && normTranscript.includes(normTradeSide)) {
        score += 10;
      }

      // 3. Advisor Match
      if (callAdvisor && trade.advisor_name && compareAdvisorNames(callAdvisor, trade.advisor_name)) {
        score += 15;
      }

      // 4. Time Proximity
      if (call.call_time && trade.trade_time) {
        try {
          const [ch, cm, cs] = call.call_time.split(':').map(Number);
          const [th, tm, ts] = trade.trade_time.split(':').map(Number);
          if (!isNaN(ch) && !isNaN(th)) {
            const callSec = ch * 3600 + (cm || 0) * 60 + (cs || 0);
            const tradeSec = th * 3600 + (tm || 0) * 60 + (ts || 0);
            const diffSec = Math.abs(tradeSec - callSec);
            if (tradeSec >= callSec && diffSec <= 3600) {
              score += Math.max(0, 20 - Math.floor(diffSec / 180));
            } else if (diffSec <= 1800) {
              score += 10;
            }
          }
        } catch {}
      }

      if (score > bestScore) {
        bestScore = score;
        bestTrade = trade;
      }
    }

    if (bestTrade && bestScore >= 70) {
      matchedIds.push(bestTrade.id);
      matchedTradeIds.add(bestTrade.id);

      // Sibling executions for the same order/scrip within 6 minutes
      const bestSymbol = (bestTrade.symbol || '').toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
      const bestSec = parseTradeSecondsFromMidnight(bestTrade.trade_time, bestTrade.trade_date);
      for (const sib of candidateTrades) {
        if (sib.id === bestTrade.id) continue;
        const sibSym = (sib.symbol || '').toUpperCase().replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '');
        if (sibSym === bestSymbol) {
          const sibSec = parseTradeSecondsFromMidnight(sib.trade_time, sib.trade_date);
          if (Math.abs(bestSec - sibSec) <= 360) {
            matchedIds.push(sib.id);
            matchedTradeIds.add(sib.id);
          }
        }
      }

      overallStatus = 'CONFIRMED';
      overallConfidence = 0.90;
      overallReason = `Correlated pre-order call to ${matchedIds.length} trade execution(s) for customer (${callerPhone10 || clientUcc}) anchored on ${bestTrade.symbol}.`;
    } else {
      overallStatus = 'NO_MATCH';
      overallConfidence = 0;
      overallReason = 'No matching executed trades found for the orders discussed in this call.';
    }
  } else {
    overallStatus = 'NO_MATCH';
    overallConfidence = 0;
    overallReason = 'No matching executed trades found for the orders discussed in this call.';
  }

  // User Mandate: Never pick a trade by guessing. No sure trade match = no primary trade ID, no audit.
  const isConfirmed = overallStatus === 'CONFIRMED' && matchedIds.length > 0;
  const finalPrimaryTradeId = isConfirmed ? matchedIds[0] : null;
  const finalMatchedTradeIds = isConfirmed ? matchedIds : [];

  const result: MultiOrderMatchResult = {
    status: overallStatus,
    clientConfirmed: Boolean(clientUcc),
    orders: processedOrders,
    matched_trade_ids: finalMatchedTradeIds,
    primary_trade_id: finalPrimaryTradeId,
    confidence: isConfirmed ? overallConfidence : 0,
    margin: 0.20,
    matching_factors: factors,
    reason: overallReason,
  };

  // 5. Persist to DB: call_orders, order_executions, and calls
  persistMultiOrderMatch(db, callId, result);

  return result;
}

/**
 * Persists the hierarchical orders and executions into the database.
 */
function ensureTablesExist(db: DatabaseSync): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS call_orders (
        id TEXT PRIMARY KEY,
        call_id INTEGER NOT NULL,
        order_index INTEGER NOT NULL,
        intent_type TEXT NOT NULL,
        symbol TEXT,
        raw_symbol TEXT,
        quantity INTEGER,
        raw_quantity TEXT,
        price_type TEXT,
        limit_price REAL,
        raw_price TEXT,
        confidence REAL DEFAULT 1.0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_executions (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        trade_id INTEGER NOT NULL,
        matched_quantity INTEGER NOT NULL,
        confidence REAL NOT NULL,
        margin REAL,
        reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_call_orders_call_id ON call_orders(call_id);
      CREATE INDEX IF NOT EXISTS idx_order_executions_order_id ON order_executions(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_executions_trade_id ON order_executions(trade_id);
    `);

    const info = db.prepare("PRAGMA table_info(calls)").all() as Array<{ name: string }>;
    const cols = new Set(info.map((c) => c.name));
    if (!cols.has('trade_match_status')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_status TEXT;'); } catch {}
    }
    if (!cols.has('matched_trade_id')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN matched_trade_id INTEGER;'); } catch {}
    }
    if (!cols.has('trade_match_confidence')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_confidence REAL;'); } catch {}
    }
    if (!cols.has('trade_match_margin')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_margin REAL;'); } catch {}
    }
    if (!cols.has('trade_match_reason')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN trade_match_reason TEXT;'); } catch {}
    }
  } catch {}
}

function persistMultiOrderMatch(
  db: DatabaseSync,
  callId: number,
  result: MultiOrderMatchResult
): void {
  ensureTablesExist(db);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    db.exec('BEGIN IMMEDIATE;');

    // Clear existing orders and executions for this call
    const existingOrders = db.prepare('SELECT id FROM call_orders WHERE call_id = ?').all(callId) as Array<{ id: string }>;
    for (const ord of existingOrders) {
      db.prepare('DELETE FROM order_executions WHERE order_id = ?').run(ord.id);
    }
    db.prepare('DELETE FROM call_orders WHERE call_id = ?').run(callId);

    // Insert orders and executions
    const insertOrder = db.prepare(`
      INSERT INTO call_orders (
        id, call_id, order_index, intent_type, symbol, raw_symbol,
        quantity, raw_quantity, price_type, limit_price, raw_price,
        confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertExecution = db.prepare(`
      INSERT INTO order_executions (
        id, order_id, trade_id, matched_quantity, confidence, margin, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ord of result.orders) {
      insertOrder.run(
        ord.id,
        callId,
        ord.order_index,
        ord.intent_type,
        ord.symbol,
        ord.raw_symbol,
        ord.quantity,
        ord.raw_quantity,
        ord.price_type,
        ord.limit_price,
        ord.raw_price,
        ord.confidence,
        now
      );

      for (const exec of ord.executions) {
        insertExecution.run(
          exec.id,
          ord.id,
          exec.trade_id,
          exec.matched_quantity,
          exec.confidence,
          exec.margin,
          exec.reason,
          now
        );
      }
    }

    // Update calls table
    db.prepare(`
      UPDATE calls SET
        trade_match_status = ?,
        matched_trade_id = ?,
        trade_match_confidence = ?,
        trade_match_margin = ?,
        trade_match_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      result.status,
      result.primary_trade_id,
      result.confidence,
      result.margin,
      result.reason,
      now,
      callId
    );

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    console.error(`[MultiExecutionMatcher] Error persisting matches for call #${callId}:`, err);
  }
}
