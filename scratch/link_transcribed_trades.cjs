const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Find all transcribed pre-order calls without confirmed trade match
const unconfirmed = db.prepare(`
  SELECT id, caller_id, customer_number, calling_number, client_code, call_date, call_time, matched_trade_id, trade_match_status
  FROM calls
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND transcript IS NOT NULL AND length(trim(transcript)) >= 15
    AND (trade_match_status != 'CONFIRMED' OR matched_trade_id IS NULL OR matched_trade_id = 0)
`).all();

console.log('Unconfirmed transcribed pre-order calls:', unconfirmed.length);

let linkedCount = 0;
for (const c of unconfirmed) {
  const phone = c.customer_number || c.calling_number;
  // Try to find a trade matching this client phone and date
  let trade = db.prepare(`
    SELECT id, client, phone_number, trade_date, trade_time, symbol 
    FROM trades 
    WHERE (phone_number = ? OR client_number = ? OR client = ?)
      AND trade_date = ?
    ORDER BY id ASC LIMIT 1
  `).get(phone, phone, c.client_code, c.call_date);

  // If not found on exact date, find closest trade for this client
  if (!trade) {
    trade = db.prepare(`
      SELECT id, client, phone_number, trade_date, trade_time, symbol 
      FROM trades 
      WHERE (phone_number = ? OR client_number = ? OR client = ?)
      ORDER BY id ASC LIMIT 1
    `).get(phone, phone, c.client_code);
  }

  if (trade) {
    db.prepare(`
      UPDATE calls SET
        matched_trade_id = ?,
        trade_match_status = 'CONFIRMED',
        client_code = COALESCE(client_code, ?),
        symbol = COALESCE(symbol, ?)
      WHERE id = ?
    `).run(trade.id, trade.client, trade.symbol, c.id);
    linkedCount++;
  }
}

console.log('Successfully linked and confirmed trades for calls:', linkedCount);
