const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const cleanPhone = (p) => (p || '').replace(/\D/g, '').slice(-10);

const trades = db.prepare('SELECT phone_number, client_number FROM trades').all();
const tradePhoneSet = new Set();
for (const t of trades) {
  const p1 = cleanPhone(t.phone_number);
  const p2 = cleanPhone(t.client_number);
  if (p1 && p1.length === 10) tradePhoneSet.add(p1);
  if (p2 && p2.length === 10) tradePhoneSet.add(p2);
}

const calls = db.prepare('SELECT id, customer_number, calling_number, classification, call_type FROM calls').all();
let matchingCallsCount = 0;
const matchingCallIds = [];

for (const c of calls) {
  const p1 = cleanPhone(c.customer_number);
  const p2 = cleanPhone(c.calling_number);
  if ((p1 && tradePhoneSet.has(p1)) || (p2 && tradePhoneSet.has(p2))) {
    matchingCallsCount++;
    matchingCallIds.push(c.id);
  }
}

console.log('Trade unique phone numbers:', tradePhoneSet.size);
console.log('Total calls matching Trade Column F:', matchingCallsCount);
console.log('Total calls currently marked as PRE_ORDER:', calls.filter(c => c.classification === 'PRE_ORDER' || c.call_type === 'pre_order').length);
