const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const cleanPhone = (p) => (p || '').replace(/\D/g, '').slice(-10);

const calls = db.prepare('SELECT id, customer_number, calling_number, client, client_code, call_date, call_time FROM calls').all();
const trades = db.prepare('SELECT id, phone_number, client_number, client, trade_date, trade_time FROM trades').all();

const tradePhones = new Set();
const tradeClients = new Set();
for (const t of trades) {
  const tp1 = cleanPhone(t.phone_number);
  const tp2 = cleanPhone(t.client_number);
  if (tp1 && tp1.length === 10) tradePhones.add(tp1);
  if (tp2 && tp2.length === 10) tradePhones.add(tp2);
  const c = (t.client || '').toUpperCase().trim();
  if (c) tradeClients.add(c);
}

let callsMatchingPhoneOrClient = 0;
for (const c of calls) {
  const p1 = cleanPhone(c.customer_number);
  const p2 = cleanPhone(c.calling_number);
  const code = (c.client_code || c.client || '').toUpperCase().trim();
  const matched = (p1 && tradePhones.has(p1)) || (p2 && tradePhones.has(p2)) || (code && tradeClients.has(code));
  if (matched) callsMatchingPhoneOrClient++;
}

console.log('Calls matching trade phone OR client code:', callsMatchingPhoneOrClient);
