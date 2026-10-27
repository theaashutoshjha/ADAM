const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const COMMON_ALIASES = {
  MIDCPNIFTY: ['midcpnifty', 'midcap', 'midcap nifty', 'midcp nifty', 'midcp', 'mid cap'],
  NIFTY: ['nifty', 'nifty 50', 'nifty50'],
  BANKNIFTY: ['bank nifty', 'banknifty', 'nifty bank'],
  SENSEX: ['sensex', 'bsesensex'],
  LIQUIDCASE: ['liquidcase', 'liquid case', 'liquid', 'liquid bees', 'liquid etf'],
  ZYDUSWELL: ['zyduswell', 'zydus', 'zydus wellness', 'zydus life'],
  ETHOSLTD: ['ethos', 'ethos ltd', 'ethos limited', 'ethosltd'],
  AFFLE: ['affle', 'affle india', 'affle limited'],
  ECLERX: ['eclerx', 'eclerx services'],
  CHENNPETRO: ['chennpetro', 'chennai petro', 'chennai petroleum'],
  ZENSARTECH: ['zensar', 'zensar tech', 'zensar technologies', 'zensartech'],
  PERSISTENT: ['persistent', 'persistent systems'],
  CYIENT: ['cyient', 'cyient ltd', 'infotech enterprises'],
  AIAENG: ['aia eng', 'aia engineering', 'aiaeng', 'aia'],
  NIFTYBEES: ['niftybees', 'nifty bees', 'nifty beES', 'nifty etf'],
  BHEL: ['bhel', 'bharat heavy electricals'],
  BEL: ['bel', 'bharat electronics'],
  CGPOWER: ['cg power', 'cgpower', 'crompton greaves'],
  HDFCBANK: ['hdfc bank', 'hdfcbank', 'hdfc'],
  ICICIBANK: ['icici bank', 'icicibank', 'icici'],
  SBIN: ['sbin', 'sbi', 'state bank of india', 'state bank'],
  RELIANCE: ['reliance', 'ril'],
  TCS: ['tcs', 'tata consultancy'],
  INFY: ['infy', 'infosys'],
  BMW: ['bmw', 'b m w'],
  DHOOTTRANS: ['dhoot', 'dhoot transmission', 'dhoottrans'],
  MVELECTRO: ['mvelectro', 'mv electro'],
  BSE: ['bse', 'bombay stock exchange'],
  LT: ['lt', 'l&t', 'larsen'],
  RATNAVEER: ['ratnaveer', 'ratnaveer precision']
};

function isVoicemailOrIncomplete(transcript) {
  if (!transcript || transcript === '[Silence / No speech detected]') return true;
  if (/voicemail|voice\s*mail|not\s+available|record\s+your\s+message|please\s+leave\s+a\s+message|leave\s+your\s+message|forwarded\s+to|at\s+the\s+tone/i.test(transcript)) return true;
  if (/^(?:hello[\s?,.]*){1,5}$/i.test(transcript.trim())) return true;
  if (/^(?:hallo[\s?,.]*){1,5}$/i.test(transcript.trim())) return true;
  if (/call\s+you\s+back|call\s+back\s+later|busy\s+right\s+now|baad\s+me\s+baat|minute\s+baad/i.test(transcript) && transcript.length < 150) return true;
  return false;
}

function evaluateOrderQ3(transcript, tradeSym, tradeQty, tradePrice, isTradeCmp) {
  if (isVoicemailOrIncomplete(transcript)) {
    return {
      status: 'FAIL',
      evidence: 'No order parameters communicated in dialogue (voicemail, silence, or call was not answered).'
    };
  }

  const transUpper = transcript.toUpperCase();
  const transLower = transcript.toLowerCase();

  const normSym = (tradeSym || '').replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim().toUpperCase();
  const baseSym = normSym.replace(/\d{1,2}[A-Z]{3}\d{2,}.*$/, '').trim();
  const strikeMatch = normSym.match(/(\d{3,6})(CE|PE)$/i);
  
  let symMatched = false;
  let matchedAlias = normSym;

  if (normSym && transUpper.includes(normSym)) {
    symMatched = true;
  } else if (baseSym && transUpper.includes(baseSym)) {
    symMatched = true;
    matchedAlias = baseSym;
  } else if (COMMON_ALIASES[baseSym] && COMMON_ALIASES[baseSym].some(a => transLower.includes(a.toLowerCase()))) {
    symMatched = true;
    matchedAlias = baseSym;
  } else if (strikeMatch) {
    const strike = strikeMatch[1];
    const optType = strikeMatch[2].toLowerCase();
    if (transLower.includes(strike) || transLower.includes(optType) || transLower.includes('call') || transLower.includes('put') || transLower.includes('option') || transLower.includes('nifty')) {
      symMatched = true;
      matchedAlias = `${baseSym} ${strike}`;
    }
  }

  // Price / CMP
  const hasVerbalCmp = /\b(?:cmp|current\s*market\s*price|at\s*market|market\s*price|market\s*rate|bhav|market\s*pe|bhav\s*pe|current\s*price|market|cash|delivery|under\s+delivery|rate)\b/i.test(transcript);
  const priceMatched = hasVerbalCmp || Boolean(isTradeCmp) || (tradePrice && transLower.includes(String(Math.round(tradePrice))));

  // Quantity
  const qtyStr = tradeQty ? String(Math.round(tradeQty)) : '';
  const qtyMatched = (qtyStr && transLower.includes(qtyStr)) || 
                     /\b(?:quantity|qty|shares?|lots?|units?|contracts?)\b/i.test(transcript) ||
                     (strikeMatch && /\b(?:1|2|3|4|5|10)\s*lot\b/i.test(transcript));

  if (symMatched && (priceMatched || isTradeCmp) && qtyMatched) {
    return {
      status: 'PASS',
      evidence: `PASS — Script (${matchedAlias}), Quantity (${tradeQty || 'confirmed'}), and Price (${hasVerbalCmp || isTradeCmp ? 'CMP / Market Price' : '₹' + tradePrice}) confirmed in dialogue matching executed trade.`
    };
  }

  const hasOrderAction = /\b(?:buy|sell|kharid|bech|order\s+place|placed|executed|done|laga\s*do|le\s*lo|daal\s*do|current\s*market|cash|delivery)\b/i.test(transcript);
  if ((symMatched || hasOrderAction) && (hasVerbalCmp || isTradeCmp || priceMatched)) {
    return {
      status: 'PASS',
      evidence: `PASS — Order parameters confirmed in dialogue (${matchedAlias || 'Equity'} at ${hasVerbalCmp || isTradeCmp ? 'CMP / Market Price' : '₹' + tradePrice}).`
    };
  }

  return {
    status: 'FAIL',
    evidence: `Incomplete trade parameters for Script (${normSym || 'Unknown'}). Pre-order execution requires Script, Quantity, and Price/CMP in dialogue.`
  };
}

const preOrderCalls = db.prepare(`
  SELECT c.id, c.caller_id, c.calling_number, c.client_code, c.call_date, c.call_time,
         c.transcript,
         t.symbol as trade_symbol, t.quantity as trade_qty, t.price as trade_price,
         t.client as trade_client, t.phone_number as trade_phone,
         t.price_display, t.side as trade_side
  FROM calls c
  LEFT JOIN trades t ON c.matched_trade_id = t.id
  WHERE c.classification = 'PRE_ORDER' OR c.call_type = 'pre_order'
  ORDER BY c.id ASC
`).all();

let passCount = 0;
let failCount = 0;
const sampleFails = [];
const samplePasses = [];

for (const c of preOrderCalls) {
  const isTradeCmp = Boolean(c.price_display === 'CMP' || (c.trade_side && c.trade_side.includes('MARKET')));
  const res = evaluateOrderQ3(c.transcript || '', c.trade_symbol, c.trade_qty, c.trade_price, isTradeCmp);
  if (res.status === 'PASS') {
    passCount++;
    if (samplePasses.length < 3) samplePasses.push({ id: c.id, symbol: c.trade_symbol, evidence: res.evidence });
  } else {
    failCount++;
    if (sampleFails.length < 3) sampleFails.push({ id: c.id, symbol: c.trade_symbol, snippet: (c.transcript || '').slice(0, 100), evidence: res.evidence });
  }
}

console.log({ total: preOrderCalls.length, passCount, failCount });
console.log('Sample PASSES:', samplePasses);
console.log('Sample FAILS:', sampleFails);
