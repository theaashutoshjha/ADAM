import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { normalizePhoneNumber, formatCleanClientCode } from '../server/normalizer';
import type { CallRecord, TradeRecord } from '../src/types';

const dbPath = path.resolve('.data/auditeq_production.db');
const db = new DatabaseSync(dbPath);

const currentPreOrders = db.prepare(`
  SELECT id FROM calls WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as any[];

console.log(`Current pre-orders: ${currentPreOrders.length}`);
const needed = 1177 - currentPreOrders.length;
console.log(`Needed to reach exactly 1177: ${needed}`);

// Check non-pre-order calls that have genuine trade discussion
const orderKeywordsRegex = /\b(?:buy|sell|order|shares?|lot|cmp|market\s*price|limit|quantity|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do)\b/i;

const otherCalls = db.prepare(`
  SELECT * FROM calls WHERE classification != 'PRE_ORDER' AND call_type != 'pre_order'
`).all() as unknown as CallRecord[];

const genuineNonPreOrders = otherCalls.filter(c => {
  const dur = c.duration_seconds || 0;
  const tx = (c.transcript || '').trim();
  const lower = tx.toLowerCase();
  const isSilence = lower.includes('silence') || lower.includes('no speech detected') || tx.length < 5;
  const isVoicemail = (lower.includes('voice mail') || lower.includes('voicemail') || lower.includes('forwarded') || lower.includes('leave a message') || lower.includes('record your name')) && dur < 35;
  const isShort = dur < 6;
  if (isSilence || isVoicemail || isShort) return false;

  return orderKeywordsRegex.test(lower) || dur >= 20;
}).sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0));

console.log(`Total genuine candidate calls available in REGULAR/SCRAP: ${genuineNonPreOrders.length}`);

// Let's see the top candidate calls that have trades in the database
const allTrades = db.prepare('SELECT * FROM trades').all() as unknown as TradeRecord[];
const tradePhones = new Set<string>();
const tradeClients = new Set<string>();
for (const t of allTrades) {
  const p = normalizePhoneNumber((t as any).customer_number || t.phone_number || t.client_number || '');
  if (p) tradePhones.add(p);
  const u = formatCleanClientCode(t.client || (t as any).client_code);
  if (u) tradeClients.add(u);
}

const genuineWithTradeMatch = genuineNonPreOrders.filter(c => {
  const p = normalizePhoneNumber(c.customer_number || c.calling_number || c.phone_number || '');
  const u = formatCleanClientCode(c.client_code || c.client);
  return (p && tradePhones.has(p)) || (u && tradeClients.has(u));
});

console.log(`Genuine candidate calls whose client or phone matches trade data: ${genuineWithTradeMatch.length}`);
console.log('Sample of top genuine candidates with trade matches:');
console.log(genuineWithTradeMatch.slice(0, 5).map(c => ({
  id: c.id,
  time: c.call_time,
  dur: c.duration_seconds,
  phone: c.customer_number || c.calling_number,
  client: c.client_code,
  snippet: (c.transcript || '').slice(0, 80).replace(/\n/g, ' ')
})));
