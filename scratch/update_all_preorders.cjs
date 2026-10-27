const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const cleanPhone = (p) => (p || '').replace(/\D/g, '').slice(-10);

const trades = db.prepare('SELECT phone_number, client_number, client FROM trades').all();
const tradePhoneMap = new Map();
for (const t of trades) {
  const p1 = cleanPhone(t.phone_number);
  const p2 = cleanPhone(t.client_number);
  if (p1 && p1.length === 10) tradePhoneMap.set(p1, t.client);
  if (p2 && p2.length === 10) tradePhoneMap.set(p2, t.client);
}

const calls = db.prepare('SELECT id, customer_number, calling_number, client, client_code FROM calls').all();

db.exec('BEGIN IMMEDIATE TRANSACTION;');
try {
  const updateStmt = db.prepare(`
    UPDATE calls SET 
      classification = 'PRE_ORDER', 
      call_type = 'pre_order',
      client_code = COALESCE(NULLIF(client_code, ''), ?),
      client = COALESCE(NULLIF(client, ''), ?),
      updated_at = datetime('now')
    WHERE id = ?
  `);

  let count = 0;
  for (const c of calls) {
    const p1 = cleanPhone(c.customer_number);
    const p2 = cleanPhone(c.calling_number);
    const matchedClient = tradePhoneMap.get(p1) || tradePhoneMap.get(p2);
    if (matchedClient) {
      updateStmt.run(matchedClient, matchedClient, c.id);
      count++;
    }
  }

  db.exec('COMMIT;');
  console.log('Successfully updated pre-order calls:', count);
} catch (err) {
  db.exec('ROLLBACK;');
  console.error(err);
}
