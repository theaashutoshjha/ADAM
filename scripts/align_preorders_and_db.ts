import { DatabaseSync } from 'node:sqlite';
import { 
  repairCallTranscriptAndSegments, 
  repairMangledClientCodesInTranscript, 
  formatCleanClientCode, 
  normalizePhoneNumber,
  ORDER_ACTION_REGEX,
  matchSymbolInTranscript
} from '../server/normalizer.js';
import { 
  calculatePreOrdersFromTrades, 
  matchPreOrdersWithCalls,
  cleanTradingScript,
  parseTradeSecondsFromMidnight
} from '../server/pipeline/tradePreOrderClusterer.js';
import { ensureScorecardsForMatchedCalls } from '../server/pipeline/reconciliation.js';

const db = new DatabaseSync('.data/auditeq_production.db');
const now = new Date().toISOString();

console.log('=== Starting Dynamic Pre-Order & Phonetic Repair Alignment ===');

// Step 1: Repair mangled client codes across all calls and segments
const calls = db.prepare('SELECT id, transcript, client_code, client, calling_number, phone_number, customer_number, call_time, call_date, duration_seconds FROM calls').all() as any[];
const trades = db.prepare('SELECT * FROM trades').all() as any[];

console.log(`Analyzing ${calls.length} calls and ${trades.length} trades in production DB...`);

// Build mapping of client phone -> clean UCC from trades
const phoneToUccMap = new Map<string, string>();
for (const t of trades) {
  const p = normalizePhoneNumber(t.phone_number || t.client_number);
  const u = formatCleanClientCode(t.client || t.client_code);
  if (p && u && !phoneToUccMap.has(p)) {
    phoneToUccMap.set(p, u);
  }
}

let repairedTranscriptsCount = 0;
let repairedSegmentsCount = 0;

for (const c of calls) {
  const p = normalizePhoneNumber(c.calling_number || c.phone_number || c.customer_number);
  const expectedUcc = formatCleanClientCode(c.client_code || c.client) || (p ? phoneToUccMap.get(p) : undefined);

  if (c.transcript) {
    const rep = repairMangledClientCodesInTranscript(c.transcript, expectedUcc);
    if (rep !== c.transcript) {
      db.prepare(`UPDATE calls SET transcript = ?, client_code = COALESCE(NULLIF(client_code, ''), ?) WHERE id = ?`)
        .run(rep, expectedUcc || null, c.id);
      repairedTranscriptsCount++;
    }
  }

  // Repair segments
  const segs = db.prepare('SELECT id, text FROM call_segments WHERE call_id = ?').all(c.id) as any[];
  for (const s of segs) {
    if (s.text) {
      const repSeg = repairMangledClientCodesInTranscript(s.text, expectedUcc);
      if (repSeg !== s.text) {
        db.prepare('UPDATE call_segments SET text = ? WHERE id = ?').run(repSeg, s.id);
        repairedSegmentsCount++;
      }
    }
  }
}

console.log(`Repaired ${repairedTranscriptsCount} call transcripts and ${repairedSegmentsCount} call segments.`);

// Step 2: Run matchPreOrdersWithCalls to establish accurate 1-to-1 cluster matching without forcing non-orders
const summary = matchPreOrdersWithCalls(db);
console.log('Pre-Orders Matching Summary:');
console.log(` - Total Orders: ${summary.total_orders}`);
console.log(` - Total Pre-Orders: ${summary.total_pre_orders}`);
console.log(` - Matched Pre-Order Calls: ${summary.total_matched_calls}`);
console.log(` - Missing Calls (Routes to Mail Confirmation): ${summary.missing_calls_count}`);
console.log(` - Mail Confirmations: ${summary.mail_confirmations_count}`);

// Step 3: Ensure all matched pre-order calls have compliance audit scorecards
const preOrderCalls = db.prepare(`
  SELECT * FROM calls 
  WHERE classification = 'PRE_ORDER' AND duration_seconds >= 6 AND status != 'scrap'
`).all() as any[];

console.log(`Publishing scorecards for pre-order calls...`);
const scorecardsCreated = ensureScorecardsForMatchedCalls(db);
console.log(`Scorecards created / synced: ${scorecardsCreated}`);

// Check missing calls count in /trades/missing-calls logic
const confirmedCalls = db.prepare(`
  SELECT matched_trade_id FROM calls 
  WHERE trade_match_status = 'CONFIRMED' 
    AND matched_trade_id IS NOT NULL 
    AND classification = 'PRE_ORDER' 
    AND status != 'scrap' 
    AND duration_seconds >= 6
`).all() as { matched_trade_id: number }[];
const confirmedTradeIdSet = new Set(confirmedCalls.map(c => c.matched_trade_id));

try {
  const orderExecTrades = db.prepare(`
    SELECT oe.trade_id FROM order_executions oe
    JOIN calls c ON oe.order_id LIKE 'order_' || c.id || '_%'
    WHERE c.classification = 'PRE_ORDER' AND c.status != 'scrap' AND c.duration_seconds >= 6
  `).all() as { trade_id: number }[];
  orderExecTrades.forEach(oe => confirmedTradeIdSet.add(oe.trade_id));
} catch {}

const missingTradesCount = trades.filter(t => !confirmedTradeIdSet.has(t.id)).length;
console.log(`Verified Missing Trades for Mail Confirmation: ${missingTradesCount}`);
console.log('=== Dynamic Alignment Complete ===');
