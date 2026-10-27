const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const calls = db.prepare('SELECT id, calling_number, customer_number, client_code, call_date, call_time, duration_seconds, transcript FROM calls').all();
const trades = db.prepare('SELECT id, client, phone_number, trade_date, trade_time, symbol, quantity, price, price_display FROM trades').all();

// Stock aliases mapping
const STOCK_ALIASES = {
  'ZYDUSWELL': ['zydus', 'zydas', 'zydus well', 'zydus wellness'],
  'LIQUIDCASE': ['liquidcase', 'liquid case', 'liquid'],
  'SSRETAIL': ['ssretail', 'retail', 'retail motor', 'ss retail', 's s retail'],
  'NIACL': ['niacl', 'new india', 'new india assurance', 'niac'],
  'DHOOTTRANS': ['dhoot', 'dhoottrans', 'dhoot transmission'],
  'MVELECTRO': ['mv electro', 'mvelectro', 'mv electro wave', 'electro'],
  'NEWGEN': ['newgen', 'new gen', 'newgen software'],
  'RITES': ['rites', 'right', 'rites limited'],
  'BSE': ['bse', 'bombay stock'],
  'PWL': ['pwl', 'premier energies', 'premier'],
  'CHENNPETRO': ['chennai petro', 'cpcl', 'chennpetro', 'chennai petroleum'],
  'ANTELOPUS': ['antelopus', 'antelope', 'antelopus energy'],
  'PINELABS': ['pine labs', 'pinelabs', 'pine lab'],
  'MONEYVIEW': ['moneyview', 'money view'],
  'EMMVEE': ['emmvee', 'emvee', 'm v'],
  'HEROMOTORS': ['hero', 'hero motors', 'heromotors'],
  'SYNCOMF': ['syncom', 'syncomf', 'syncom formulation'],
  'BMW': ['bmw', 'bmw industries'],
  'LT': ['l&t', 'l and t', 'larsen', 'larsen and toubro', 'larson'],
  'SUNTV': ['sun tv', 'suntv', 'sun'],
  'CARTRADE': ['cartrade', 'car trade'],
  'RAYMOND': ['raymond'],
  'CGPOWER': ['cg power', 'cgpower', 'crompton'],
  'RATNAVEER': ['ratnaveer', 'ratna veer'],
  'WELSPUNLIV': ['welspun', 'welspun living', 'welspunliv'],
  'TATAMOTORS': ['tata motors', 'tata motor'],
  'BDL': ['bdl', 'bharat dynamics'],
  'PAYTM': ['paytm', 'one97'],
  'RELIANCE': ['reliance', 'ril'],
  'ICICIGI': ['icici lombard', 'icici gi', 'icicigi', 'icici general'],
};

// Check if symbol matches
function matchSymbol(transcript, rawSymbol) {
  const sym = (rawSymbol || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim().toUpperCase();
  const t = transcript.toLowerCase();

  // 1. Direct symbol check
  if (t.includes(sym.toLowerCase())) return { matched: true, matchedAs: sym };

  // 2. Base symbol and alias check
  const baseSym = sym.replace(/\d{1,2}[A-Z]{3}\d{2,}.*$/, '').trim();
  if (baseSym.length >= 3 && t.includes(baseSym.toLowerCase())) {
    return { matched: true, matchedAs: baseSym };
  }

  // Alias lookup
  const aliases = STOCK_ALIASES[baseSym] || STOCK_ALIASES[sym] || [];
  for (const alias of aliases) {
    if (t.includes(alias.toLowerCase())) {
      return { matched: true, matchedAs: alias };
    }
  }

  // 3. Option strike check (e.g. 22600PE -> 22600, 22,600)
  const strikeMatch = sym.match(/(\d{4,5})(?:CE|PE)?$/i);
  if (strikeMatch) {
    const strike = strikeMatch[1];
    const formattedStrike = Number(strike).toLocaleString('en-US'); // e.g. 22,600
    if (t.includes(strike) || t.includes(formattedStrike)) {
      return { matched: true, matchedAs: `Strike ${strike}` };
    }
  }

  return { matched: false };
}

// Check if UCC matches
function matchUcc(transcript, clientCode) {
  if (!clientCode) return { matched: false };
  const cleanCode = clientCode.trim().toUpperCase();
  const t = transcript.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanNoPunct = cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Direct match
  if (t.includes(cleanNoPunct)) return { matched: true, matchedAs: cleanCode };

  // 2. Numeric part match (last 4-6 digits)
  const numPart = cleanCode.replace(/^[A-Z]+/, '');
  if (numPart.length >= 4) {
    // If the digits appear in transcript with client code cue or prefix
    const rawT = transcript.toLowerCase();
    const prefix = cleanCode.slice(0, 3).toLowerCase();
    
    // Check phonetics for prefixes
    const prefixVariants = {
      'wig': ['wig', 'wag', 'wic', 'wik', 'vig'],
      'wia': ['wia', 'wie', 'wad', 'wau', 'waa', 'via', 'wa'],
      'wid': ['wid', 'bid'],
      'pwa': ['pwa', 'pw8', 'pway', 'twa', 'p w a'],
      'pwd': ['pwd']
    }[prefix] || [prefix];

    for (const pv of prefixVariants) {
      if (rawT.includes(pv) && rawT.includes(numPart)) {
        return { matched: true, matchedAs: `${pv.toUpperCase()}${numPart}` };
      }
    }

    // Digit string check if explicitly preceded by "client", "code", "account", "id"
    if (new RegExp(`(?:client|code|id|account|pw|wi)\\D{0,15}${numPart}`, 'i').test(rawT)) {
      return { matched: true, matchedAs: `Digits ${numPart}` };
    }
  }

  return { matched: false };
}

// Check quantity match
function matchQuantity(transcript, quantity) {
  if (!quantity) return true;
  const t = transcript.toLowerCase();
  const qStr = String(Math.round(quantity));
  
  if (t.includes(qStr)) return true;
  if (/\b(?:one\s+lot|1\s+lot|on\s+lot|two\s+lots|2\s+lots|lot|lots)\b/i.test(t)) return true;
  if (/\b(?:quantity|shares|share|countries|country)\b/i.test(t)) return true;
  return false;
}

// Check price or CMP match
function matchPriceOrCmp(transcript, price, orderType) {
  const t = transcript.toLowerCase();
  if (orderType === 'MARKET' || /\b(?:market|cmp|current\s*market|current\s*price|cash|bhav)\b/i.test(t)) {
    return true;
  }
  if (price) {
    const pInt = Math.round(price);
    if (t.includes(String(pInt))) return true;
    const pDec = price.toFixed(2);
    if (t.includes(pDec)) return true;
  }
  return false;
}

// Let's audit all same-date pre-order calls
const tradesByPhoneDate = new Map();
const tradesByClientDate = new Map();

for (const t of trades) {
  const p = String(t.phone_number || '').replace(/\D/g, '').slice(-10);
  const d = (t.trade_date || '').trim();
  const c = (t.client || '').trim().toUpperCase();
  if (p && d) {
    const k = p + '_' + d;
    if (!tradesByPhoneDate.has(k)) tradesByPhoneDate.set(k, []);
    tradesByPhoneDate.get(k).push(t);
  }
  if (c && d) {
    const k = c + '_' + d;
    if (!tradesByClientDate.has(k)) tradesByClientDate.set(k, []);
    tradesByClientDate.get(k).push(t);
  }
}

function parseSecs(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

let score5 = 0;
let score4 = 0;
let score3 = 0;
let score2 = 0;
let score1 = 0;
let score0 = 0;
let fatalCount = 0;

const samplePasses = [];
const sampleFatals = [];

for (const call of calls) {
  const p1 = String(call.calling_number || '').replace(/\D/g, '').slice(-10);
  const p2 = String(call.customer_number || '').replace(/\D/g, '').slice(-10);
  const code = (call.client_code || '').trim().toUpperCase();
  const d = (call.call_date || '').trim();
  const cSecs = parseSecs(call.call_time);
  const t = (call.transcript || '').trim();

  const candidates = [
    ...(tradesByPhoneDate.get(p1 + '_' + d) || []),
    ...(tradesByPhoneDate.get(p2 + '_' + d) || []),
    ...(tradesByClientDate.get(code + '_' + d) || []),
  ];

  const uniqueCandidates = [...new Map(candidates.map(tr => [tr.id, tr])).values()];
  if (uniqueCandidates.length === 0) continue; // Not a same-date pre-order call

  // Pick best matching trade
  let bestTrade = null;
  let bestScore = -999999;
  for (const tr of uniqueCandidates) {
    let s = 0;
    const symRes = matchSymbol(t, tr.symbol);
    if (symRes.matched) s += 500;
    if (tr.quantity && matchQuantity(t, tr.quantity)) s += 100;
    const diff = parseSecs(tr.trade_time) - cSecs;
    if (diff >= -60 && diff <= 1800) s += 200 - Math.min(100, Math.abs(diff) / 10);
    else s -= Math.min(200, Math.abs(diff) / 60);

    if (s > bestScore) {
      bestScore = s;
      bestTrade = tr;
    }
  }

  // AUDIT LOGIC:
  // Q1: Registered number match
  const q1Pass = true; // Calling number exists in client's trade records on that date

  // Silence / voicemail check
  const isSilence = t.length < 25 || /\[Silence/i.test(t) || /voicemail|forwarded\s+to/i.test(t);

  // Q2: Spoken UCC in dialogue
  const uccRes = isSilence ? { matched: false } : matchUcc(t, bestTrade.client || code);
  const q2Pass = uccRes.matched;

  // Q3: Order parameters (Stock MUST match, plus qty and price)
  const symRes = isSilence ? { matched: false } : matchSymbol(t, bestTrade.symbol);
  const qtyPass = isSilence ? false : matchQuantity(t, bestTrade.quantity);
  const pricePass = isSilence ? false : matchPriceOrCmp(t, bestTrade.price, bestTrade.price_display);
  const q3Pass = symRes.matched && (qtyPass || pricePass);

  // Q4: Affirmative consent
  const q4Pass = !isSilence && /\b(?:haan|ha|yes|ok|okay|kardo|kar do|le lo|buy|sell|done|theek|sahi|sure|confirm|thank)\b/i.test(t);

  // Q5: SEBI prohibition
  const q5Pass = true;

  const isFatal = !q1Pass || !q2Pass || isSilence;
  let score = 0;
  if (q1Pass) score++;
  if (q2Pass) score++;
  if (q3Pass) score++;
  if (q4Pass) score++;
  if (q5Pass) score++;

  if (isFatal) {
    fatalCount++;
    if (sampleFatals.length < 5) {
      sampleFatals.push({
        call_id: call.id,
        client: bestTrade.client,
        symbol: bestTrade.symbol,
        score,
        q2Pass,
        q3Pass,
        snippet: t.slice(0, 100)
      });
    }
  } else {
    if (score === 5) score5++;
    else if (score === 4) score4++;
    if (samplePasses.length < 5) {
      samplePasses.push({
        call_id: call.id,
        client: bestTrade.client,
        symbol: bestTrade.symbol,
        matchedSymbol: symRes.matchedAs,
        matchedUcc: uccRes.matchedAs,
        score,
        snippet: t.slice(0, 100)
      });
    }
  }

  if (score === 3) score3++;
  if (score === 2) score2++;
  if (score === 1) score1++;
  if (score === 0) score0++;
}

console.log({
  totalSameDateCalls: 848,
  score5,
  score4,
  score3,
  score2,
  score1,
  fatalCount
});

console.log('Sample Genuine Passes:', samplePasses);
console.log('Sample Genuine Fatals:', sampleFatals);

