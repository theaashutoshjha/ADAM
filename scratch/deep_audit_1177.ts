import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve('.data/auditeq_production.db');
const db = new DatabaseSync(dbPath);

console.log('=== DEEP GENUINENESS & ACCURACY AUDIT OF 1177 PRE-ORDERS ===');

const preOrders = db.prepare(`
  SELECT id, caller_id, customer_number, calling_number, call_time, duration_seconds, 
         classification, call_type, status, matched_trade_id, client_code, transcript
  FROM calls 
  WHERE classification = 'PRE_ORDER' OR call_type = 'pre_order'
`).all() as any[];

console.log(`Total pre-order calls loaded: ${preOrders.length}`);

// Categorize every single call:
let validTradePreOrders = 0;
let doubtfulCalls: any[] = [];
let pureScrapCalls: any[] = [];
let generalSupportCalls: any[] = [];
let shortOrOneSidedCalls: any[] = [];

const tradingKeywords = /\b(?:buy|sell|order|shares?|lot|cmp|market\s*price|limit|quantity|price|bhav|kharid|bech|kar\s*do|theek\s*hai|confirm|le\s*lo|daal\s*do|liquid\s*case|option|strike|put|call\s*option|target|stoploss|square\s*off|exit|position)\b/i;

const scrapPhrases = [
  'silence', 'no speech detected', 'voice mail', 'voicemail', 'forwarded to',
  'leave a message', 'record your name', 'please try later', 'currently busy',
  'switched off', 'not reachable', 'network issue', 'tune of', 'call has been forwarded',
  'forward it, please', 'press 1', 'press 2', 'welcome to airtel', 'welcome to jio'
];

const generalSupportPhrases = [
  'password reset', 'statement', 'ledger', 'demat', 'kyc', 'email address',
  'bank account', 'change address', 'nominee', 'how to login', 'app not working'
];

for (const call of preOrders) {
  const dur = call.duration_seconds || 0;
  const tx = (call.transcript || '').trim();
  const lower = tx.toLowerCase();

  // 1. Scrap check
  const hasScrapPhrase = scrapPhrases.some(p => lower.includes(p));
  const isTooShort = dur < 8;
  const isOneSided = (!lower.includes('client:') && !lower.includes('customer:') && !lower.includes('yes') && !lower.includes('haan') && !lower.includes('ok') && !lower.includes('hello')) || tx.length < 25;

  if (hasScrapPhrase && dur < 40) {
    pureScrapCalls.push({ id: call.id, dur, reason: 'Voicemail/Carrier greeting/Scrap phrase', snippet: tx.slice(0, 100) });
    continue;
  }

  if (isTooShort && !tradingKeywords.test(lower)) {
    shortOrOneSidedCalls.push({ id: call.id, dur, reason: 'Short (<8s) without trade discussion', snippet: tx.slice(0, 100) });
    continue;
  }

  // 2. Pure general support inquiry (No trade discussion)
  const isGeneral = generalSupportPhrases.some(p => lower.includes(p)) && !tradingKeywords.test(lower);
  if (isGeneral) {
    generalSupportCalls.push({ id: call.id, dur, reason: 'General non-trading support call', snippet: tx.slice(0, 100) });
    continue;
  }

  // 3. Trade discussion check
  const hasTradeKeywords = tradingKeywords.test(lower);
  if (hasTradeKeywords || dur >= 20) {
    validTradePreOrders++;
  } else {
    doubtfulCalls.push({ id: call.id, dur, reason: 'Short call without explicit trade keywords', snippet: tx.slice(0, 100) });
  }
}

console.log('\n--- DETAILED BREAKDOWN ---');
console.log(`- Definitely Genuine Trade Pre-Orders: ${validTradePreOrders}`);
console.log(`- Pure Scrap Calls (Voicemail/Carrier/IVR): ${pureScrapCalls.length}`);
console.log(`- Short / One-sided Calls (<8s no trades):   ${shortOrOneSidedCalls.length}`);
console.log(`- General Non-Trading Support Calls:        ${generalSupportCalls.length}`);
console.log(`- Doubtful / Needs Inspection:              ${doubtfulCalls.length}`);

if (pureScrapCalls.length > 0) {
  console.log('\nSample Pure Scrap Calls:');
  console.log(pureScrapCalls.slice(0, 5));
}
if (shortOrOneSidedCalls.length > 0) {
  console.log('\nSample Short / One-Sided Calls:');
  console.log(shortOrOneSidedCalls.slice(0, 5));
}
if (generalSupportCalls.length > 0) {
  console.log('\nSample General Support Calls:');
  console.log(generalSupportCalls.slice(0, 5));
}
if (doubtfulCalls.length > 0) {
  console.log('\nSample Doubtful Calls:');
  console.log(doubtfulCalls.slice(0, 5));
}
