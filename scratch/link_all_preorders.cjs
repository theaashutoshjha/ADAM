const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

// Find all calls matching trades by 10-digit phone or UCC
const updateStmt = db.prepare(`
  UPDATE calls SET
    call_type = 'pre_order',
    classification = 'PRE_ORDER',
    matched_trade_id = ?,
    client_code = COALESCE(client_code, ?),
    updated_at = datetime('now')
  WHERE id = ?
`);

const unclassified = db.prepare(`
  SELECT c.id, c.calling_number, c.phone_number, c.client_code, t.id as trade_id, t.client
  FROM calls c
  JOIN trades t ON (
    c.calling_number = t.phone_number 
    OR c.calling_number = t.client_number
    OR (length(c.client_code) > 3 AND c.client_code = t.client)
  )
  WHERE (c.classification IS NULL OR c.classification != 'PRE_ORDER')
     OR (c.call_type IS NULL OR c.call_type != 'pre_order')
     OR c.matched_trade_id IS NULL
`).all();

console.log('Unclassified or unlinked calls found:', unclassified.length);

const updatedIds = new Set();
for (const row of unclassified) {
  if (!updatedIds.has(row.id)) {
    updateStmt.run(row.trade_id, row.client, row.id);
    updatedIds.add(row.id);
  }
}

console.log('Successfully updated calls to PRE_ORDER with matched_trade_id:', updatedIds.size);

const finalPreOrders = db.prepare(`
  SELECT count(*) as count FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).get().count;

console.log('Total pre-order calls in DB now:', finalPreOrders);
