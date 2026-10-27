import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const db = new DatabaseSync(path.resolve('.data/auditeq_production.db'));

const scorecards = db.prepare(`
  SELECT s.*, c.transcript, c.customer_number as call_cust_phone, c.calling_number as call_phone,
         t.client as trade_client, t.client_number as trade_client_phone, t.phone_number as trade_phone_num,
         t.symbol, t.quantity, t.price, t.price_display
  FROM scorecards s
  LEFT JOIN calls c ON c.id = s.call_id
  LEFT JOIN trades t ON t.id = s.resolved_trade_id
  WHERE s.is_current = 1
`).all() as any[];

console.log('Total scorecards:', scorecards.length);

const q2Fails = scorecards.filter(s => s.q2_status !== 'PASS');
const q3Fails = scorecards.filter(s => s.q3_status !== 'PASS');

console.log(`Current Q2 Fails: ${q2Fails.length}`);
console.log(`Current Q3 Fails: ${q3Fails.length}`);

// Analyze Q2 fails
let q2PhoneActuallyMatched = 0;
let q2UccActuallySpoken = 0;
let q2NeitherPhoneNorUcc = 0;

for (const sc of q2Fails) {
  const tx = (sc.transcript || '').toLowerCase();
  const txClean = tx.replace(/[^a-z0-9]/g, '');

  const callP = (sc.calling_number || sc.call_phone || sc.call_cust_phone || '').replace(/\D/g, '').slice(-10);
  const tradeP = (sc.registered_number || sc.trade_phone || sc.trade_client_phone || sc.trade_phone_num || '').replace(/\D/g, '').slice(-10);

  const phoneMatch = Boolean(callP && tradeP && callP === tradeP);
  if (phoneMatch) q2PhoneActuallyMatched++;

  const clientCode = (sc.client || sc.client_code || sc.trade_client || '').toLowerCase();
  const clientClean = clientCode.replace(/[^a-z0-9]/g, '');
  const digitsOnly = clientClean.replace(/^[a-z]+/, '');

  const uccSpoken = Boolean(
    (clientClean && txClean.includes(clientClean)) ||
    (digitsOnly.length >= 4 && (txClean.includes(digitsOnly) || tx.includes(digitsOnly)))
  );

  if (uccSpoken) q2UccActuallySpoken++;
  if (!phoneMatch && !uccSpoken) q2NeitherPhoneNorUcc++;
}

console.log(`\n--- Q2 FAILS BREAKDOWN ---`);
console.log(`Phone was actually registered/matched line: ${q2PhoneActuallyMatched}`);
console.log(`UCC/Client Code digits were actually spoken in transcript: ${q2UccActuallySpoken}`);
console.log(`Neither phone matched nor UCC spoken (True Non-Compliances): ${q2NeitherPhoneNorUcc}`);

// Analyze Q3 fails
let q3ScripActuallyMentioned = 0;
let q3OptionOrStrikeMentioned = 0;
let q3QtyMentioned = 0;
let q3PriceOrCmpMentioned = 0;
let q3TrueFail = 0;

for (const sc of q3Fails) {
  const tx = (sc.transcript || '').toLowerCase();
  const txClean = tx.replace(/[^a-z0-9]/g, '');

  const sym = (sc.symbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim().toLowerCase();
  const symClean = sym.replace(/[^a-z0-9]/g, '');
  const baseSym = sym.replace(/\d+.*$/, '');

  const scripMentioned = Boolean(
    (symClean && txClean.includes(symClean)) ||
    (baseSym.length >= 3 && (txClean.includes(baseSym) || tx.includes(baseSym)))
  );
  if (scripMentioned) q3ScripActuallyMentioned++;

  // Strike or Option type (e.g. 22500, PE, CE, Put, Call)
  const strikeMatch = sym.match(/(\d{4,6})/);
  const strike = strikeMatch ? strikeMatch[1] : '';
  const isOption = sym.endsWith('ce') || sym.endsWith('pe') || sym.includes('call') || sym.includes('put');
  const optionMentioned = Boolean(
    (strike && (txClean.includes(strike) || tx.includes(strike))) ||
    (isOption && (tx.includes('put') || tx.includes('call') || tx.includes('pe') || tx.includes('ce')))
  );
  if (optionMentioned) q3OptionOrStrikeMentioned++;

  const qty = sc.quantity || 0;
  const qtyMentioned = Boolean(qty > 0 && (tx.includes(String(qty)) || txClean.includes(String(qty))));
  if (qtyMentioned) q3QtyMentioned++;

  const price = sc.price || 0;
  const isCmp = sc.price_display === 'CMP';
  const priceMentioned = Boolean(
    isCmp ||
    tx.includes('cmp') ||
    tx.includes('market') ||
    (price > 0 && (tx.includes(String(price)) || tx.includes(String(Math.round(price)))))
  );
  if (priceMentioned) q3PriceOrCmpMentioned++;

  if (!scripMentioned && !optionMentioned) {
    q3TrueFail++;
  }
}

console.log(`\n--- Q3 FAILS BREAKDOWN ---`);
console.log(`Scrip/Stock root was actually mentioned in dialogue: ${q3ScripActuallyMentioned}`);
console.log(`Option strike or Call/Put was mentioned: ${q3OptionOrStrikeMentioned}`);
console.log(`Quantity was explicitly mentioned: ${q3QtyMentioned}`);
console.log(`Price / CMP was mentioned: ${q3PriceOrCmpMentioned}`);
console.log(`Neither scrip nor strike/option mentioned (True Non-Compliances): ${q3TrueFail}`);
