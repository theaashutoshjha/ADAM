const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare('SELECT id, calling_number, phone_number, client_code, recording_url, storage_path FROM calls').all();
const trades = db.prepare('SELECT id, phone_number, client_number, client FROM trades').all();

const trade10Map = new Map();
for (const t of trades) {
  const p1 = (t.phone_number || '').replace(/\D/g, '').slice(-10);
  const p2 = (t.client_number || '').replace(/\D/g, '').slice(-10);
  const c = (t.client || '').trim().toUpperCase();
  if (p1.length === 10) trade10Map.set(p1, t.id);
  if (p2.length === 10) trade10Map.set(p2, t.id);
  if (c.length >= 4) trade10Map.set(c, t.id);
}

let matchedCallIds = new Set();
for (const c of calls) {
  const p1 = (c.calling_number || '').replace(/\D/g, '').slice(-10);
  const p2 = (c.phone_number || '').replace(/\D/g, '').slice(-10);
  const code = (c.client_code || '').trim().toUpperCase();
  if (p1.length === 10 && trade10Map.has(p1)) matchedCallIds.add(c.id);
  else if (p2.length === 10 && trade10Map.has(p2)) matchedCallIds.add(c.id);
  else if (code.length >= 4 && trade10Map.has(code)) matchedCallIds.add(c.id);
}

console.log('Total calls matching trades by 10-digit normalized phone or UCC:', matchedCallIds.size);
