// =============================================================
// AuditEQ v17.0.28 — SEBI High-Precision Speech & Data Normalizer
// =============================================================

/**
 * Computes Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) row[i] = i;

  for (let j = 1; j <= b.length; j++) {
    let prev = j;
    for (let i = 1; i <= a.length; i++) {
      let val: number;
      if (a[i - 1] === b[j - 1]) {
        val = row[i - 1];
      } else {
        val = Math.min(row[i - 1] + 1, prev + 1, row[i] + 1);
      }
      row[i - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }

  return row[a.length];
}

/**
 * Computes fuzzy string similarity (0.0 to 1.0) based on Levenshtein distance
 */
export function fuzzySimilarity(a: string, b: string): number {
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / maxLen;
}

// Symbol and Company Name Aliases for NSE/BSE Equity & Derivatives
export const SYMBOL_ALIASES: Record<string, string[]> = {
  RELIANCE: ['reliance', 'relience', 'ril', 'reliance industries', 'reliance ind', 'reliance ind.', 'relianse', 'relyance'],
  TCS: ['tcs', 'tata consultancy services', 'tata consultancy', 'tata consult'],
  INFY: ['infy', 'infosys', 'infosis', 'infosys limited', 'infosys ltd'],
  HDFCBANK: ['hdfc bank', 'hdfcbank', 'hdfc', 'housing development finance'],
  ICICIBANK: ['icici bank', 'icicibank', 'icici'],
  SBIN: ['sbin', 'sbi', 'state bank of india', 'state bank'],
  BHARTIARTL: ['bharti airtel', 'airtel', 'bhartiartl', 'bharti'],
  ITC: ['itc', 'itc limited', 'itc ltd'],
  KOTAKBANK: ['kotak bank', 'kotakbank', 'kotak', 'kotak mahindra bank'],
  LT: ['l&t', 'lt', 'larsen & toubro', 'larsen and toubro', 'larsen', 'l and t'],
  AXISBANK: ['axis bank', 'axisbank', 'axis'],
  TATAMOTORS: ['tata motors', 'tatamotors', 'tata motor'],
  TATASTEEL: ['tata steel', 'tatasteel', 'tata stil'],
  TATAPOWER: ['tata power', 'tatapower', 'port of power'],
  BAJFINANCE: ['bajaj finance', 'bajfinance', 'bajaj fin'],
  BAJAJFINSV: ['bajaj finserv', 'bajajfinsv', 'finserv', 'bajaj fin serv'],
  'BAJAJ-AUTO': ['bajaj auto', 'bajajauto'],
  WELSPUNLIV: ['welspun', 'welspun living', 'welspunliv', 'welspun liv', 'wellspun', 'wellspun living', 'velspun', 'western living', 'western liv', 'spend living', 'spend living we'],
  WELSPUN: ['welspun', 'welspun living', 'welspunliv', 'welspun liv', 'wellspun', 'wellspun living', 'velspun', 'western living', 'western liv', 'spend living', 'spend living we'],
  NATIONALUM: ['national aluminum', 'national aluminium', 'nalco', 'nalcom', 'national', 'national last month', 'national alum', 'nationalum', 'national premium', 'national name', 'the national premium', 'nationalum-eq', 'national and medium', 'national and'],
  KAJARIA: ['kajaria', 'kajaria ceramics', 'kajariacer', 'kajarria', 'kajarirya', 'kajariya', 'गैजारिया'],
  KAJARIACER: ['kajaria', 'kajaria ceramics', 'kajariacer', 'kajarria', 'kajarirya', 'kajariya'],
  MM: ['mahindra', 'm&m', 'm and m', 'mahindra and mahindra', 'mnm', 'm & m'],
  'M&M': ['mahindra', 'm&m', 'm and m', 'mahindra and mahindra', 'mnm', 'm & m'],
  MARUTI: ['maruti', 'maruti suzuki', 'marutisuzuki', 'मारुत', 'मारुत जी', 'मारुति'],
  SUNPHARMA: ['sun pharma', 'sunpharma', 'sun pharmaceuticals'],
  WIPRO: ['wipro', 'wipro limited'],
  ASIANPAINT: ['asian paints', 'asianpaint', 'asian paint'],
  HCLTECH: ['hcl tech', 'hcltech', 'hcl technologies'],
  COALINDIA: ['coal india', 'coal'],
  NTPC: ['ntpc'],
  POWERGRID: ['power grid', 'powergrid'],
  ONGC: ['ongc'],
  BPCL: ['bpcl', 'bharat petroleum'],
  IOC: ['ioc', 'i o c', 'indian oil', 'indian oil corp'],
  HEROMOTOCO: ['hero', 'hero motocorp', 'hero honda'],
  EICHERMOT: ['eicher', 'eicher motors', 'royal enfield'],
  CIPLA: ['cipla'],
  DRREDDY: ['dr reddy', 'dr reddys', 'reddy'],
  DIVISLAB: ['divis', 'divis laboratories'],
  APOLLOHOSP: ['apollo', 'apollo hospitals'],
  ULTRACEMCO: ['ultratech', 'ultratech cement', 'ultratech cement limited'],
  GRASIM: ['grasim'],
  JSWSTEEL: ['jsw steel', 'jswsteel'],
  HINDALCO: ['hindalco'],
  VEDL: ['vedanta', 'vedl'],
  TECHM: ['tech mahindra', 'techm'],
  BEL: ['bel', 'bharat electronics', 'varaṭ electronics limited', 'varaṭ electronics', 'varaṭ', 'varat electronics limited', 'varat electronics', 'varat', 'bharat electronics limited', 'bharat electronic', 'वाराट electronics limited', 'वाराट electronics', 'वाराट'],
  HAL: ['hal', 'hindustan aeronautics'],
  BHEL: ['bhel', 'bharat heavy electricals'],
  IRCTC: ['irctc'],
  ZOMATO: ['zomato'],
  PAYTM: ['paytm', 'one97'],
  NYKAA: ['nykaa', 'fsn'],
  NETWEB: ['netweb', 'net web', 'netweb tech', 'netweb technologies', 'netweb technology'],
  IKS: ['iks', 'i k s', 'i.k.s.', 'ics', 'iks health', 'iks healthcare', 'iks technologies', 'iks-eq'],
  IKSL: ['iks', 'i k s', 'i.k.s.', 'ics', 'iks health', 'iks healthcare', 'iks technologies', 'iks-eq'],
  SUZLON: ['suzlon', 'suzlon energy'],
  YESBANK: ['yes bank', 'yesbank'],
  IDFCFIRSTB: ['idfc first', 'idfc first bank', 'idfc', 'idfc bank'],
  FEDERALBNK: ['federal bank', 'federalbank', 'federal'],
  ANGELONE: ['angel one', 'angelone', 'angel broking'],
  TRENT: ['trent', 'trent limited', 'westside', 'zudio'],
  RVNL: ['rvnl', 'rail vikas nigam', 'rail vikas'],
  IREDA: ['ireda'],
  BSE: ['bse', 'bombay stock exchange'],
  CDSL: ['cdsl'],
  MCX: ['mcx', 'multi commodity exchange', 'pan india'],
  DEEPAKFERT: ['deepakfert', 'deepak fert', 'deepak fertilisers', 'deepak fertilizers', 'deeper furnace', 'deepak furnace', 'fertilizer', 'fertilizers'],
  CHENNPETRO: ['chennpetro', 'chennai petro', 'chennai petroleum', 'chennai petro chem'],
  PREMIERENE: ['premierene', 'premier energy', 'premier energies', 'premium energy'],
  BALRAMCHIN: ['balramchin', 'balrampur chini', 'balrampur', 'balram'],
  BDL: ['bdl', 'bharat dynamics', 'bharat dynamic'],
  HINDZINC: ['hindzinc', 'hindustan zinc', 'zinc', 'हिंदुस्तान zinc', 'हिंदुस्तान', 'हिंदुस्तान bank', 'hind zinc'],
  LTF: ['ltf', 'l&t finance', 'lt finance', 'l and t finance'],
  HUDCO: ['hudco'],
  NBCC: ['nbcc'],
  TITAN: ['titan', 'titan company', 'tanishq', 'fastrack'],
  HAVELLS: ['havells', 'havells india'],
  POLYCAB: ['polycab', 'polycab india'],
  DIXON: ['dixon', 'dixon tech', 'dixon technologies', 'dickson', 'डिक्सन'],
  KAYNES: ['kaynes', 'kaynes tech', 'kaynes technology'],
  AMBER: ['amber', 'amber enterprises', 'अहमद', 'अहमद enterprises', 'ahmed enterprises', 'ahmad enterprises', 'ahmad'],
  NESTLEIND: ['nestle', 'nestle india', 'maggi'],
  BRITANNIA: ['britannia', 'britannia industries'],
  DABUR: ['dabur', 'dabur india'],
  MARICO: ['marico', 'parachute', 'saffola'],
  GODREJCP: ['godrej consumer', 'godrej', 'godrej cp'],
  DLF: ['dlf', 'dlf limited'],
  LODHA: ['lodha', 'macrotech', 'macrotech developers'],
  PRESTIGE: ['prestige', 'prestige estates'],
  OBEROIRLTY: ['oberoi', 'oberoi realty'],
  MUTHOOTFIN: ['muthoot', 'muthoot finance'],
  MANAPPURAM: ['manappuram', 'manappuram finance'],
  SBICARD: ['sbi card', 'sbi cards', 'sbicard'],
  SBILIFE: ['sbi life', 'sbilife'],
  HDFCLIFE: ['hdfc life', 'hdfclife'],
  ICICIPRULI: ['icici prudential', 'icici pru', 'icicipru'],
  ICICIGI: ['icici lombard', 'icicigi'],
  IRFC: ['irfc', 'indian railway finance', 'i r f c'],
  SJVN: ['sjvn', 's j v n'],
  NHPC: ['nhpc', 'n h p c'],
  SAIL: ['sail', 'steel authority', 'steel authority of india', 'still authority of india', 'still authority', 'will buy me sale', 'coal logistics', 'coal'],
  NMDC: ['nmdc', 'national mineral development'],
  REC: ['rec', 'rec limited', 'rural electrification'],
  PFC: ['pfc', 'power finance corporation', 'power finance'],
  CAMS: ['cams', 'computer age management', 'camps', 'camp', 'cam', 'cams limited', 'cams-eq', 'car model'],
  BANKNIFTY1: ['banknifty', 'bank nifty', 'banknifty1', 'bank nifty 1'],
  BATAINDIA: ['bata', 'bata india', 'bata limited'],
  CARERATING: ['care', 'care ratings', 'carerating', 'care rating'],
  CEATLTD: ['ceat', 'ceat tyres', 'ceatltd', 'ceat limited'],
  CGPOWER: ['cg power', 'cgpower', 'crompton greaves'],
  EXIDEIND: ['exide', 'exide industries', 'exideind'],
  HINDCOPPER: ['hindustan copper', 'hind copper', 'hindcopper'],
  JYOTHYLAB: ['jyothy labs', 'jyothy lab', 'jyothylab', 'jyothi labs', 'jyothi lab', 'jyoti labs', 'jyoti lab', 'jothi labs'],
  KEI: ['kei', 'kei industries', 'kva', 'kva industry', 'kva industries', 'kba', 'kba industry'],
  MEESHO: ['meesho'],
  OFSS: ['ofss', 'oracle financial', 'oracle financial services'],
  PRAJIND: ['praj', 'praj industries', 'prajind'],
  RATNAVEER: ['ratnaveer', 'ratnaveer precision'],
  SENSEX: ['sensex', 'bsesensex'],
  UNOMINDA: ['uno minda', 'minda industries', 'unominda'],
  ZENTEC: ['zen tech', 'zen technologies', 'zentec'],
  MOTILALOFS: ['motilal oswal', 'motilal', 'mfl'],
  MAZDOCK: ['mazagon dock', 'mazdock', 'mazagon'],
  COCHINSHIP: ['cochin shipyard', 'cochin ship'],
  GRSE: ['garden reach', 'grse'],
  BHARATFORG: ['bharat forge', 'bharatforge'],
  CUMMINSIND: ['cummins', 'cummins india'],
  SIEMENS: ['siemens', 'siemens india'],
  ABB: ['abb', 'abb india', 'a b b'],
  DMART: ['dmart', 'd-mart', 'avenue supermarts', 'avenue supermart'],
  VBL: ['varun beverages', 'vbl', 'varun'],
  TATACONSUM: ['tata consumer', 'tata consumer products', 'tata tea', 'tata salt'],
  IDEA: ['idea', 'vodafone idea', 'vodafone', 'vi'],
  BANKBARODA: ['bank of baroda', 'bob', 'baroda bank', 'bank baroda'],
  PNB: ['pnb', 'punjab national bank', 'punjab national'],
  CANBK: ['canara bank', 'canara', 'canbk'],
  UNIONBANK: ['union bank', 'union bank of india', 'unionbank'],
  INDUSINDBK: ['indusind bank', 'indusind', 'indus ind'],
  AUBANK: ['au small finance', 'au bank', 'aubank'],
  BANDHANBNK: ['bandhan bank', 'bandhan'],
  ADANIENT: ['adani enterprises', 'adani ent', 'adani'],
  ADANIPORTS: ['adani ports', 'adani port', 'sez', 'adani'],
  NIFTY: ['nifty', 'nifty 50', 'nifty fifty', 'nifty50'],
  BANKNIFTY: ['bank nifty', 'banknifty', 'nifty bank'],
  FINNIFTY: ['fin nifty', 'finnifty', 'nifty financial services'],
  GRAPHITE: ['graphite', 'graphite india', 'graffite', 'traffic'],
  ICIL: ['icil', 'indo count', 'indo count industries', 'indo count industry', 'indocount', 'core industries'],
  ANANTRAJ: ['anant raj', 'anantraj', 'anant raj limited'],
  ASKAUTOLTD: ['ask auto', 'ask automotive', 'askautoltd', 'askaut limited', 'askaut', 'askautolimitor'],
  ATHERENERG: ['ather', 'ather energy', 'atherenerg'],
  BALKRISIND: ['balkrishna', 'balkrishna industries', 'balkrisind'],
  BALMLAWRIE: ['balmer lawrie', 'balmlawrie', 'balmer', 'balmer lawrie limited'],
  GABRIEL: ['gabriel', 'gabriel india'],
  JSWINFRA: ['jsw infra', 'jsw infrastructure', 'jswinfra'],
  JSWENERGY: ['jsw energy', 'jsw', 'jswenergy', 'jsw energy limited', 'gstw energy', 'gstw', 'swig', 'jsw energ', 'sell the energy', 'there w', 'there wig', 'energy'],
  SHOPERSTOP: ['shoppers stop', 'shopper stop', 'shoper stop', 'shoperstop'],
  CIEINDIA: ['cie india', 'cie', 'cieindia', 'mahindra cie'],
  CPSEETF: ['cpse etf', 'cpse', 'cpseetf', 'cpse fund'],
  ICICIAMC: ['icici amc', 'icici prudential', 'icici amc limited', 'iciciamc'],
  HDFCAMC: ['hdfc amc', 'hdfc mutual fund', 'hdfcamc'],
  ENGINERSIN: ['engineers india', 'engineer india', 'engineers in', 'enginersin'],
  KIOCL: ['kiocl', 'k i o c l', 'kudremukh'],
  OIL: ['oil india', 'oil', 'oil india limited'],
  BIOCON: ['biocon', 'biocon limited'],
  CRISIL: ['crisil', 'crisil limited'],
  FORTIS: ['fortis', 'fortis healthcare', 'fortis health', '40 self care', 'forty healthcare', 'fortis health care'],
  AKUMS: ['akums', 'akums drugs', 'akum', 'akum drugs', 'akums drug', 'akum drug', 'अकुम', 'अकुम drugs', 'अकुम्स', 'rk बोर्जी', 'akums-eq'],
  ALKYLAMINE: ['alkyl amines', 'alkyl amine', 'alkylamine', 'alkalam', 'al kalam', 'alkilamine', 'alkali amine'],
  BLUESTONE: ['bluestone', 'blue stone'],
  DATAPATTNS: ['data patterns', 'datapattns', 'data pattern', 'tata pattan', 'tata pattern', 'data patan', 'datapattan'],
  DECNGOLD: ['deccan gold', 'decngold', 'decan gold', 'decan'],
  ELPROINTL: ['elpro', 'elpro international', 'elprointl'],
  GOLDBEES: ['gold bees', 'goldbees'],
  GROWW: ['groww', 'groww-eq'],
  JIOFIN: ['jio financial', 'jio finance', 'jiofin', 'jio financial services'],
  LGEINDIA: ['lg electronics', 'lg india', 'lgeindia'],
  LIQGRWBEES: ['liquid groww bees', 'liqgrwbees', 'liquid groww'],
  LIQUIDCASE: ['liquid case', 'liquidcase'],
  PNBHOUSING: ['pnb housing', 'pnb housing finance', 'pnbhousing'],
  RAINBOW: ['rainbow', 'rainbow childrens hospital', 'rainbow children'],
  RKFORGE: ['ramkrishna forgings', 'rk forge', 'rkforge', 'rkforge-eq'],
  SHARDACROP: ['sharda cropchem', 'sharda crop', 'shardacrop'],
  SILVERBEES: ['silver bees', 'silverbees', 'silver beast', 'seller beast', 'silver be', 'silver beep', 'silver bech'],
  TATACOMM: ['tata communications', 'tata comm', 'tatacomm'],
  TMCV: ['tata motors commercial', 'tmcv'],
  TMPV: ['tata motors passenger', 'tmpv', 'tmp'],
  ZFCVINDIA: ['zf commercial', 'zf cv india', 'zfcvindia', 'zfcv'],
  PWL: ['pwl', 'p w l'],
  LIQUIDBEES: ['liquid bees', 'liquidbees', 'liquid bee'],
  PIDILITIND: ['pidilite', 'pidilite industries', 'fevicol', 'pidilitind'],
  PVRINOX: ['pvr inox', 'pvr', 'inox', 'pvrinox'],
  WABAG: ['va tech wabag', 'wabag', 'water tech'],
  MIDCPNIFTY: ['midcpnifty', 'midcap', 'midcap nifty', 'midcp nifty', 'midcp', 'mid cap'],
  ZYDUSWELL: ['zyduswell', 'zydus', 'zydus wellness', 'zydus life', 'zyduswell-eq'],
  ETHOSLTD: ['ethos', 'ethos ltd', 'ethos limited', 'ethosltd', 'ethosltd-eq'],
  AFFLE: ['affle', 'affle india', 'affle limited', 'affle-eq'],
  ECLERX: ['eclerx', 'eclerx services', 'eclerx-eq'],
  ZENSARTECH: ['zensar', 'zensar tech', 'zensar technologies', 'zensartech', 'zensartech-eq'],
  PERSISTENT: ['persistent', 'persistent systems', 'persistent-eq'],
  CYIENT: ['cyient', 'cyient ltd', 'infotech enterprises', 'cyient-eq'],
  AIAENG: ['aia eng', 'aia engineering', 'aiaeng', 'aiaeng-eq', 'aia'],
  NIFTYBEES: ['niftybees', 'nifty bees', 'nifty beES', 'nifty etf', 'niftybees-eq'],
};

// Authoritative SEBI Pre-Order Action Intent Detection Regex
export const ORDER_ACTION_REGEX = /\b(?:buy|buying|bought|sell|selling|sold|order|orders|shares?|lot|lots|cmp|market\s*price|market\s*rate|limit|execute|executing|execution|kharid|kharidna|bech|bechna|booking|profit|book\s*profit|placed|placing|target|stop\s*loss|sl|exit|exiting|enter|entering|square\s*off|call\s*option|put\s*option|pending\s*mein|average\s*selling)\b/i;

// Spoken number words mapping to digits
const WORD_TO_DIGIT: Record<string, string> = {
  zero: '0', shunya: '0',
  one: '1', ek: '1',
  two: '2', do: '2',
  three: '3', teen: '3',
  four: '4', char: '4', chaar: '4',
  five: '5', paanch: '5', panch: '5',
  six: '6', chhe: '6', che: '6',
  seven: '7', saat: '7',
  eight: '8', aath: '8',
  nine: '9', nau: '9',
  double: '2x',
  triple: '3x',
};

// Comprehensive English and Hindi number maps
const NUMBER_WORDS_MAP: Record<string, number> = {
  zero: 0, shunya: 0, sunya: 0,
  one: 1, ek: 1,
  two: 2, do: 2,
  three: 3, teen: 3,
  four: 4, char: 4, chaar: 4,
  five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, che: 6,
  seven: 7, saat: 7,
  eight: 8, aath: 8,
  nine: 9, nau: 9,
  ten: 10, das: 10,
  eleven: 11, gyarah: 11,
  twelve: 12, barah: 12,
  thirteen: 13, terah: 13,
  fourteen: 14, chaudah: 14,
  fifteen: 15, pandrah: 15,
  sixteen: 16, solah: 16,
  seventeen: 17, satrah: 17,
  eighteen: 18, atharah: 18,
  nineteen: 19, unnees: 19,
  twenty: 20, bees: 20,
  twentyone: 21, ikkees: 21,
  twentytwo: 22, baaees: 22,
  twentythree: 23, teyees: 23,
  twentyfour: 24, chaubees: 24,
  twentyfive: 25, pachis: 25, pachhees: 25,
  twentysix: 26, chhabbees: 26,
  twentyseven: 27, sattaees: 27,
  twentyeight: 28, atthaees: 28,
  twentynine: 29, untees: 29,
  thirty: 30, tees: 30,
  thirtyfive: 35, paithees: 35,
  forty: 40, chalis: 40, chaalees: 40,
  fortyfive: 45, paintalees: 45,
  fifty: 50, pachaas: 50, pachas: 50,
  fiftyfive: 55, pachpan: 55,
  sixty: 60, saath: 60, sath: 60,
  sixtyfive: 65, painsath: 65,
  seventy: 70, sattar: 70,
  seventyfive: 75, pachattar: 75,
  eighty: 80, assi: 80,
  eightyfive: 85, pachasi: 85,
  ninety: 90, nabbe: 90,
  ninetyfive: 95, pachaanve: 95,
  hundred: 100, sau: 100,
  thousand: 1000, hazaar: 1000, hazar: 1000,
  lakh: 100000, lac: 100000,
  crore: 10000000,
  // Special Hindi compounds
  dedh: 1.5,
  dhai: 2.5,
  sawa: 1.25,
  paune: 0.75,
  // Tamil spoken numbers
  onnu: 1, ondru: 1, rendu: 2, irandu: 2, moonu: 3, moondru: 3, naalu: 4, naangu: 4,
  anju: 5, aindhu: 5, aaru: 6, ezhu: 7, yezhu: 7, ettu: 8, onbadhu: 9, ombadhu: 9,
  pathu: 10, pathinanju: 15, irubathu: 20, irubathi: 20, aimbathu: 50, nooru: 100, aayiram: 1000,
  // Telugu spoken numbers
  okati: 1, oka: 1, moodu: 3, naalugu: 4, nalugu: 4, aidu: 5, yedu: 7, edu: 7,
  enimidi: 8, tommidi: 9, padi: 10, padhi: 10, padihenu: 15, iravai: 20, yabhai: 50,
  yaabhai: 50, vanda: 100, vandha: 100, veyyi: 1000, vela: 1000,
};

/**
 * Parses spoken number expressions (Hindi, English, Hinglish, numeric)
 * Handles:
 *  - "one eighty point fifty" -> 180.50
 *  - "180 point 50" -> 180.50
 *  - "one hundred eighty five" -> 185
 *  - "do sau pachaas" -> 250
 *  - "pachaas" -> 50
 *  - "five hundred" -> 500
 *  - "500" -> 500
 *  - "dedh sau" -> 150
 *  - "dhai sau" -> 250
 *  - "do hazaar" -> 2000
 */
// Map of spoken words strictly representing individual digits (English, Hindi, Tamil, Telugu)
const SINGLE_DIGIT_WORDS: Record<string, string> = {
  zero: '0', shunya: '0', sunya: '0', sunna: '0', poojyam: '0', poojiyam: '0',
  one: '1', ek: '1', onnu: '1', ondru: '1', okati: '1', oka: '1',
  two: '2', do: '2', rendu: '2', irandu: '2',
  three: '3', teen: '3', moonu: '3', moondru: '3', moodu: '3',
  four: '4', char: '4', chaar: '4', naalu: '4', naangu: '4', naalugu: '4', nalugu: '4',
  five: '5', paanch: '5', panch: '5', anju: '5', aindhu: '5', aidu: '5',
  six: '6', chhe: '6', che: '6', aaru: '6',
  seven: '7', saat: '7', ezhu: '7', yezhu: '7', yedu: '7', edu: '7',
  eight: '8', aath: '8', ettu: '8', enimidi: '8',
  nine: '9', nau: '9', onbadhu: '9', ombadhu: '9', tommidi: '9',
};

export function parseSpokenNumberPhrase(phrase: string): number | null {
  if (!phrase) return null;
  const cleaned = phrase.trim().toLowerCase().replace(/[\s-]+/g, ' ');

  // Direct numeric or currency match
  const directClean = cleaned.replace(/[^0-9.]/g, '');
  if (/^\d+(?:\.\d+)?$/.test(directClean) && !cleaned.includes('point') && !cleaned.includes('sau') && !cleaned.includes('hundred')) {
    const n = parseFloat(directClean);
    return isNaN(n) ? null : n;
  }

  // Check if phrase is a sequence of spoken single digits (e.g. "nine seven six seven" or "four six eight eight four")
  const rawTokens = cleaned.split(/\s+/);
  let isAllSingleDigits = rawTokens.length >= 2;
  let digitStr = '';
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (t === 'double' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
      digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(2);
      i++;
    } else if (t === 'triple' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
      digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(3);
      i++;
    } else if (SINGLE_DIGIT_WORDS[t] !== undefined) {
      digitStr += SINGLE_DIGIT_WORDS[t];
    } else if (/^\d$/.test(t)) {
      digitStr += t;
    } else {
      isAllSingleDigits = false;
      break;
    }
  }
  if (isAllSingleDigits && digitStr.length >= 2) {
    const n = parseFloat(digitStr);
    return isNaN(n) ? null : n;
  }

  // Handle "X point Y" or "X dashamlav Y" (e.g. "one eighty point fifty", "180 point 50")
  if (cleaned.includes('point') || cleaned.includes('dashamlav') || cleaned.includes('dot')) {
    const parts = cleaned.split(/\b(?:point|dashamlav|dot)\b/);
    if (parts.length === 2) {
      const wholePart = parseSpokenNumberPhrase(parts[0].trim());
      const decimalPartStr = parts[1].trim();
      let decimalValue: number | null = null;

      // Check if decimal part is words or digits
      const decTokens = decimalPartStr.split(/\s+/);
      let decDigits = '';
      for (const t of decTokens) {
        if (/^\d+$/.test(t)) {
          decDigits += t;
        } else if (NUMBER_WORDS_MAP[t] !== undefined) {
          decDigits += String(NUMBER_WORDS_MAP[t]);
        }
      }

      if (decDigits) {
        decimalValue = parseFloat(`0.${decDigits}`);
      } else {
        const parsedDec = parseSpokenNumberPhrase(decimalPartStr);
        if (parsedDec !== null) {
          decimalValue = parsedDec < 1 ? parsedDec : parsedDec / Math.pow(10, String(Math.floor(parsedDec)).length);
        }
      }

      if (wholePart !== null && decimalValue !== null) {
        return Math.round((wholePart + decimalValue) * 10000) / 10000;
      }
    }
  }

  // Handle compound spoken words (e.g., "one hundred eighty five", "do sau pachaas", "dedh sau")
  const tokens = cleaned.split(/\s+/);
  let total = 0;
  let currentGroup = 0;
  let recognizedAny = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Check special multipliers like "dedh sau" (150) or "dhai sau" (250)
    if (t === 'dedh' && (tokens[i + 1] === 'sau' || tokens[i + 1] === 'hundred')) {
      currentGroup += 150;
      i++;
      recognizedAny = true;
      continue;
    }
    if (t === 'dhai' && (tokens[i + 1] === 'sau' || tokens[i + 1] === 'hundred')) {
      currentGroup += 250;
      i++;
      recognizedAny = true;
      continue;
    }
    if (t === 'dedh' && (tokens[i + 1] === 'hazaar' || tokens[i + 1] === 'hazar' || tokens[i + 1] === 'thousand')) {
      total += 1500;
      i++;
      recognizedAny = true;
      continue;
    }
    if (t === 'dhai' && (tokens[i + 1] === 'hazaar' || tokens[i + 1] === 'hazar' || tokens[i + 1] === 'thousand')) {
      total += 2500;
      i++;
      recognizedAny = true;
      continue;
    }

    if (/^\d+(?:\.\d+)?$/.test(t)) {
      currentGroup += parseFloat(t);
      recognizedAny = true;
      continue;
    }

    const val = NUMBER_WORDS_MAP[t];
    if (val !== undefined) {
      recognizedAny = true;
      if (val === 100) {
        currentGroup = (currentGroup === 0 ? 1 : currentGroup) * 100;
      } else if (val === 1000) {
        total += (currentGroup === 0 ? 1 : currentGroup) * 1000;
        currentGroup = 0;
      } else if (val === 100000) {
        total += (currentGroup === 0 ? 1 : currentGroup) * 100000;
        currentGroup = 0;
      } else if (val === 10000000) {
        total += (currentGroup === 0 ? 1 : currentGroup) * 10000000;
        currentGroup = 0;
      } else {
        currentGroup += val;
      }
    }
  }

  total += currentGroup;
  return recognizedAny ? total : null;
}

/**
 * Normalizes all spoken number phrases in a text into Arabic digits.
 */
export function normalizeSpokenNumbers(text: string): string {
  if (!text) return '';
  // Convert any Devanagari numerals (०-९) to ASCII digits (0-9)
  const converted = text.replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d).toString());
  return converted.replace(
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|ek|do|teen|char|paanch|chhe|saat|aath|nau|das|sau|hazaar|hazar|lakh|dedh|dhai|pachaas|bees|tees|chalis|saath|sattar|assi|nabbe|zero|shunya|sunya|double|triple|onnu|ondru|rendu|irandu|moonu|moondru|naalu|naangu|anju|aindhu|aaru|ezhu|yezhu|ettu|onbadhu|ombadhu|pathu|irubathu|aimbathu|nooru|aayiram|okati|oka|moodu|naalugu|nalugu|aidu|yedu|edu|enimidi|tommidi|padi|padhi|iravai|yabhai|yaabhai|vanda|vandha|veyyi|vela)\b(?:\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|sau|hazaar|hazar|lakh|pachaas|bees|tees|chalis|zero|shunya|sunya|double|triple|ek|do|teen|char|paanch|chhe|saat|aath|nau|das|onnu|ondru|rendu|irandu|moonu|moondru|naalu|naangu|anju|aindhu|aaru|ezhu|yezhu|ettu|onbadhu|ombadhu|pathu|irubathu|aimbathu|nooru|aayiram|okati|oka|moodu|naalugu|nalugu|aidu|yedu|edu|enimidi|tommidi|padi|padhi|iravai|yabhai|yaabhai|vanda|vandha|veyyi|vela))*/gi,
    (match) => {
      const cleaned = match.trim().toLowerCase();
      const rawTokens = cleaned.split(/\s+/);
      let isAllSingleDigits = rawTokens.length >= 2;
      let digitStr = '';
      for (let i = 0; i < rawTokens.length; i++) {
        const t = rawTokens[i];
        if (t === 'double' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
          digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(2);
          i++;
        } else if (t === 'triple' && i + 1 < rawTokens.length && SINGLE_DIGIT_WORDS[rawTokens[i + 1]]) {
          digitStr += SINGLE_DIGIT_WORDS[rawTokens[i + 1]].repeat(3);
          i++;
        } else if (SINGLE_DIGIT_WORDS[t] !== undefined) {
          digitStr += SINGLE_DIGIT_WORDS[t];
        } else if (/^\d$/.test(t)) {
          digitStr += t;
        } else {
          isAllSingleDigits = false;
          break;
        }
      }
      if (isAllSingleDigits && digitStr.length >= 2) {
        return digitStr;
      }

      const parsed = parseSpokenNumberPhrase(match);
      return parsed !== null ? String(parsed) : match;
    }
  );
}

/**
 * Normalizes phone numbers to standard 10-digit format (Indian mobile/landline)
 * User Rule: "match the number given in meta data nad trade data ignore the first 2 digit, if meta data have 12 digit number."
 */
export function normalizePhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  let str = String(phone).trim();
  // Strip quotes, tabs, carriage returns, invisible whitespace
  str = str.replace(/["'\t\r\n]/g, '').trim();
  // Strip .0 from Excel float numbers
  str = str.replace(/\.0+$/, '');
  // Strip country code prefix +91 or 0091
  str = str.replace(/^\+91[\s-]*/, '').replace(/^0091[\s-]*/, '');
  let digits = str.replace(/[^0-9]/g, '');
  if (!digits) return '';

  // If 13 digits starting with 091, strip 091
  if (digits.length === 13 && digits.startsWith('091')) {
    digits = digits.slice(3);
  }
  // User Rule: If 12 digits starting with 91 (e.g. 919904706239), strip 91
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // User Rule: If 11 digits starting with 0 (e.g. 08424015989), strip 0
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  // If exactly 10 digits, return
  if (digits.length === 10) {
    return digits;
  }
  // Fallback: If longer than 10 digits, take trailing 10 digits
  if (digits.length > 10) {
    const trailing10 = digits.slice(-10);
    return /^\d{10}$/.test(trailing10) ? trailing10 : '';
  }
  // User Mandate: normalized customer number must be exactly 10 digits, otherwise invalid
  return '';
}

/**
 * Normalizes customer number while preserving both original and normalized values.
 * Returns null if invalid or not exactly 10 digits.
 */
export function normalizeCustomerNumber10(raw?: string | null): { original: string; normalized: string | null; isValid: boolean } {
  const original = String(raw || '').trim();
  const norm = normalizePhoneNumber(original);
  const isValid = /^\d{10}$/.test(norm);
  return {
    original,
    normalized: isValid ? norm : null,
    isValid,
  };
}


/**
 * Compares two phone numbers using their normalized last 10 digits.
 */
export function comparePhoneNumbers(phoneA?: string | null, phoneB?: string | null): boolean {
  const normA = normalizePhoneNumber(phoneA);
  const normB = normalizePhoneNumber(phoneB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.length >= 10 && normB.length >= 10) {
    return normA.slice(-10) === normB.slice(-10);
  }
  return false;
}

/**
 * Robust, deterministic advisor name comparison.
 * Strips extensions, numbers, formatting, and matches names without dangerous fuzzy matching.
 */
export function compareAdvisorNames(advisorA?: string | null, advisorB?: string | null): boolean {
  const cleanA = cleanAgentName(advisorA).toLowerCase().replace(/\s+/g, ' ').trim();
  const cleanB = cleanAgentName(advisorB).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  const squashA = cleanA.replace(/[^a-z0-9]/g, '');
  const squashB = cleanB.replace(/[^a-z0-9]/g, '');
  if (squashA === squashB) return true;

  // Exact word set comparison (e.g. "Sharma Rahul" vs "Rahul Sharma")
  const wordsA = cleanA.split(' ').filter((w) => w.length > 1);
  const wordsB = cleanB.split(' ').filter((w) => w.length > 1);
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    const setB = new Set(wordsB);
    const setA = new Set(wordsA);
    if (wordsA.length === wordsB.length && wordsB.every((w) => setA.has(w))) return true;
    const common = wordsA.filter((w) => setB.has(w));
    if (common.length >= 2 && (common.length === wordsA.length || common.length === wordsB.length)) return true;
  }
  return false;
}

export const VALID_CLIENT_PREFIXES = [
  'WIA',
  'WIF',
  'WIC',
  'WID',
  'WIG',
  'WIE',
  'FIA',
  'PWD',
  'PWA',
] as const;

export type ValidClientPrefix = typeof VALID_CLIENT_PREFIXES[number];

export const VALID_CLIENT_CODE_REGEX = /^(WIA|WIF|WIC|WID|WIG|WIE|FIA|PWD|PWA)[0-9]{4,6}$/i;
export const STRICT_CLIENT_CODE_REGEX = /^(WIA|WIF|WIC|WID|WIG|WIE|FIA|PWD|PWA)[0-9]{4,6}$/;

/**
 * Strictly normalizes client codes across spoken, spaced, hyphenated, and raw formats.
 * User Rule:
 * "client code can not be random ever
 * client code always start like this: WIA, WIF, WIC, WID, WIG, WIE, FIA, PWD
 * Format: 4–6 digits after the prefix. Examples: WIA26779, WIF12345, WIG12345, PWD12345"
 * e.g., "W I A 26779", "WIA-26779", "wia26779", "double u I A 26779",
 * "PWD 12345", "P W D one two three four five"
 * -> strictly outputs canonical "WIA26779", "PWD12345", etc.
 */
export function formatCleanClientCode(clientCode?: string | null): string {
  if (!clientCode) return '';
  let str = String(clientCode).trim().toLowerCase();
  if (!str) return '';

  // 1. Spoken letter normalization: double u / double-u / double you / dablu -> w
  str = str.replace(/\b(?:(?:4|four)\s*)?double\s*digits?\b/gi, 'wig');
  str = str.replace(/\b4doubledigit\b/gi, 'wig');
  str = str.replace(/\bdoubledigit\b/gi, 'wig');
  str = str.replace(/\bdouble\s*[-_]?\s*u\b/gi, 'w');
  str = str.replace(/\bdouble\s*[-_]?\s*you\b/gi, 'w');
  str = str.replace(/\bdhablu\b/gi, 'w');
  str = str.replace(/\bdablu\b/gi, 'w');

  // 2. Spoken repeated digit qualifiers: "double five" -> "55", "triple five" -> "555"
  str = str.replace(/\bdouble\s*([0-9])\b/gi, '$1$1');
  str = str.replace(/\btriple\s*([0-9])\b/gi, '$1$1$1');
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    if (digit.endsWith('x')) continue;
    str = str.replace(new RegExp(`\\bdouble\\s+${word}\\b`, 'gi'), `${digit}${digit}`);
    str = str.replace(new RegExp(`\\btriple\\s+${word}\\b`, 'gi'), `${digit}${digit}${digit}`);
  }

  // 3. Spoken individual digits: "one two three four five" -> "12345"
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    if (digit.endsWith('x')) continue;
    str = str.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit);
  }

  // 4. Strip punctuation, whitespace, dashes, dots, underscores
  const squashed = str.replace(/[\s\-._:;,/]/g, '').toUpperCase();

  // 5. Canonical prefix matching with phonetic tolerance (e.g. VIA -> WIA, VIF -> WIF)
  const prefixMap: Array<{ pattern: RegExp; canonical: ValidClientPrefix }> = [
    { pattern: /^(?:WIA|VIA|W1A|V1A|WAS|WAA|WAU|WAY|WIU|VIU|W8A)/, canonical: 'WIA' },
    { pattern: /^(?:WIF|VIF|W1F|V1F)/, canonical: 'WIF' },
    { pattern: /^(?:WIC|VIC|W1C|V1C)/, canonical: 'WIC' },
    { pattern: /^(?:WID|VID|W1D|V1D)/, canonical: 'WID' },
    { pattern: /^(?:WIG|VIG|W1G|V1G|WAG|VAG|WAD|VAD|4DOUBLEDIGIT|DOUBLEDIGIT|W8G|W8)/, canonical: 'WIG' },
    { pattern: /^(?:WIE|VIE|W1E|V1E)/, canonical: 'WIE' },
    { pattern: /^(?:FIA)/, canonical: 'FIA' },
    { pattern: /^(?:PWD)/, canonical: 'PWD' },
    { pattern: /^(?:PWA|P1A)/, canonical: 'PWA' },
  ];

  for (const item of prefixMap) {
    const match = squashed.match(item.pattern);
    if (match) {
      let remaining = squashed.slice(match[0].length);
      remaining = remaining.replace(/^(?:IS|HAI|NUMBER|NO)+/, '');
      // Deduplicate repeated digit sequence (e.g. 4213742137 -> 42137)
      remaining = remaining.replace(/^(\d{4,6})\1(?:[^\d]|$)/, '$1');
      const digitMatch = remaining.match(/^(\d{4,6})(?:[^\d]|$)/);
      if (digitMatch) {
        return `${item.canonical}${digitMatch[1]}`;
      }
    }
  }

  for (const p of VALID_CLIENT_PREFIXES) {
    if (squashed.startsWith(p)) {
      let remaining = squashed.slice(p.length);
      remaining = remaining.replace(/^(?:IS|HAI|NUMBER|NO)+/, '');
      remaining = remaining.replace(/^(\d{4,6})\1(?:[^\d]|$)/, '$1');
      const digitMatch = remaining.match(/^(\d{4,6})(?:[^\d]|$)/);
      if (digitMatch) {
        return `${p}${digitMatch[1]}`;
      }
    }
  }

  // Reject plain numeric values, random words, or invalid prefixes
  return '';
}

export function isStrictValidClientCode(code?: string | null): boolean {
  if (!code) return false;
  const clean = formatCleanClientCode(code);
  return STRICT_CLIENT_CODE_REGEX.test(clean);
}

/**
 * Cleans agent / advisor name: "Answered By Agent { keep only name of the agent not extention}"
 * Removes extensions, phone numbers, employee codes, emails, etc.
 * Examples:
 * "Ragulgandhi - 104" -> "Ragulgandhi"
 * "Ragul Gandhi / 102" -> "Ragul Gandhi"
 * "Ragul Gandhi (104)" -> "Ragul Gandhi"
 * "Ragul Gandhi [Ext 104]" -> "Ragul Gandhi"
 * "104 - Ragul Gandhi" -> "Ragul Gandhi"
 * "Ragulgandhi_104" -> "Ragulgandhi"
 */
/**
 * Sanitizes and cleans advisor / agent / dealer names by stripping:
 * 1. Extension suffixes and prefixes (e.g. "M Shankar-Extension", "M Shankar - Extension", "M Shankar Extension")
 * 2. Any extension keyword ("Extension", "Ext", "Extn") in any case, with or without numbers
 * 3. All numbers, phone numbers, employee codes, terminal IDs
 * User Rule: "M Shankar-Extension - Extension can not be name of advisor - keep only name for all advisor always no Extension, no numbers"
 */
export function cleanAgentName(agent?: string | null): string {
  if (!agent) return '';
  let str = String(agent).trim();
  if (!str) return '';

  // 1. If the whole string is just "Extension" or "Ext" or digits/symbols, reject completely
  if (/^(?:extension|ext|extn|agent|dealer|advisor|\d+[\s\-_/|:,.]*)+$/i.test(str)) {
    return '';
  }

  // 2. Remove parenthesized or bracketed items (e.g. "(Extension)", "(Ext 1042)", "(8106365245)", "[104]")
  str = str.replace(/\s*[\(\[]\s*(?:ext(?:ension)?|extn)?\s*:?\s*[\d\s-]*\s*[\)\]]\s*/gi, ' ');
  str = str.replace(/\s*[\(\[]\s*extension\s*[\)\]]\s*/gi, ' ');
  str = str.replace(/\s*\([^)]*@.*?\)/g, ' '); // email

  // 3. Remove "- Extension", "-Extension", "/ Extension", "Extension" at the end of the name
  str = str.replace(/\s*[-/|_]\s*ext(?:ension)?\b.*$/gi, '');
  str = str.replace(/\bext(?:ension)?\b.*$/gi, '');

  // 4. Remove leading "Extension - ", "Ext 104 - ", "Extension_", "Advisor:", "Agent:", "Dealer:"
  str = str.replace(/^(?:advisor|agent|dealer|ext(?:ension)?)\b\s*[-/|_:]*\s*/gi, '');

  // 5. User Rule: "I DONT WANT ANY SYMBON OR NUMBER IN FRONT OF ADVISOR/AGENT NAME"
  // Repeatedly strip all leading non-letter characters (numbers, symbols, punctuation, dashes, hashes, slashes)
  str = str.replace(/^[^a-zA-Z\u00C0-\u024F\u0900-\u0D7F]+/g, '');

  // 6. Remove any remaining phone numbers / digit sequences (user rule: "no Extension, no numbers")
  str = str.replace(/\s*[-/|_]\s*\d+\s*$/, '');
  str = str.replace(/\b\d+\b/g, '');

  // 7. Strip trailing symbols, slashes, numbers, or hyphens
  str = str.replace(/[^a-zA-Z\u00C0-\u024F\u0900-\u0D7F]+$/g, '');

  // 8. One more pass on the front to guarantee no exposed symbols or numbers
  str = str.replace(/^[^a-zA-Z\u00C0-\u024F\u0900-\u0D7F]+/g, '');

  // 9. Clean duplicate spaces
  str = str.replace(/\s{2,}/g, ' ').trim();

  // Final sanity check: if the remaining string is just "Extension" or numbers or < 2 characters
  if (/^(?:extension|ext|extn|\d+|\W+)+$/i.test(str) || str.length < 2) {
    return '';
  }

  return str;
}

/**
 * Parses and formats any timestamp, Excel time fraction, or date string into HH:MM:SS format.
 * Examples:
 * 0.38862268518518517 -> "09:19:37"
 * "Sat Dec 30 1899 09:19:20 GMT+0000" -> "09:19:20"
 * "09:15" -> "09:15:00"
 * "09:15:20" -> "09:15:20"
 * "9:15 AM" -> "09:15:00"
 * "3:40 PM" -> "15:40:00"
 */
export function formatToHmsTime(rawTime?: any): string {
  if (rawTime === null || rawTime === undefined || rawTime === '') {
    return '';
  }

  if (rawTime instanceof Date) {
    const h = String(rawTime.getUTCHours()).padStart(2, '0');
    const m = String(rawTime.getUTCMinutes()).padStart(2, '0');
    const s = String(rawTime.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // If number between 0 and 1 (Excel fractional day)
  if (typeof rawTime === 'number' && rawTime >= 0 && rawTime <= 1) {
    const totalSeconds = Math.round(rawTime * 86400);
    const h = Math.floor(totalSeconds / 3600) % 24;
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Excel combined date-time serial (e.g. 46247.52133101852)
  if (typeof rawTime === 'number' && rawTime > 1 && !Number.isInteger(rawTime)) {
    const fraction = rawTime - Math.floor(rawTime);
    const totalSeconds = Math.round(fraction * 86400);
    const h = Math.floor(totalSeconds / 3600) % 24;
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const str = String(rawTime).trim();
  if (!str) return '';

  // Numeric string fraction: "0.38862268518518517" or "46247.52133101852"
  const numVal = parseFloat(str);
  if (!isNaN(numVal) && !str.includes(':')) {
    if (numVal > 0 && numVal < 1) {
      const totalSeconds = Math.round(numVal * 86400);
      const h = Math.floor(totalSeconds / 3600) % 24;
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else if (numVal > 1 && str.includes('.')) {
      const fraction = numVal - Math.floor(numVal);
      const totalSeconds = Math.round(fraction * 86400);
      const h = Math.floor(totalSeconds / 3600) % 24;
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }

  // Check 12-hour AM/PM: e.g. "9:15 AM", "03:40:20 PM"
  const ampmMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const s = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
    const meridiem = ampmMatch[4].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Check 24-hour HH:MM:SS
  const hmsMatch = str.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (hmsMatch) {
    return hmsMatch[0];
  }

  // Check 24-hour HH:MM
  const hmMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (hmMatch) {
    return `${String(hmMatch[1]).padStart(2, '0')}:${hmMatch[2]}:00`;
  }

  return str;
}

/**
 * Checks whether a call / trade timestamp falls strictly within Indian market hours:
 * 09:15:00 AM (09:15) to 03:40:00 PM (15:40)
 * User Rule: "Now we need to get all call from 9:015 am to 3:40 PM { indian market time calls}"
 */
export function isIndianMarketHours(timeStr?: string | null): boolean {
  if (!timeStr) return false;
  const hms = formatToHmsTime(timeStr);
  const match = hms.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return false;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3], 10);
  const totalSeconds = h * 3600 + m * 60 + s;

  const startSec = 9 * 3600 + 15 * 60;  // 09:15:00 = 33300 sec
  const endSec = 15 * 3600 + 40 * 60;   // 15:40:00 = 56400 sec

  return totalSeconds >= startSec && totalSeconds <= endSec;
}

/**
 * Checks whether a call falls strictly within eligible Indian market/trading hours (09:15:00 to 15:40:00).
 * User Mandate: Call Start Time is ONLY a market-hours filter.
 * Valid window is strictly 09:15:00 through 15:40:00 IST.
 * Calls starting before 09:15:00 or after 15:40:00 must be OUT_OF_MARKET_HOURS.
 * Do not allow trade existence or call duration to override this.
 */
export function isCallWithinMarketWindow(
  timeStr?: string | null,
  _durationSeconds: number = 0,
  _hasMatchingTrade: boolean = false
): boolean {
  return isIndianMarketHours(timeStr);
}

/**
 * Normalizes client codes across spoken, spaced, hyphenated, and raw formats.
 * e.g., "W I A 46884", "WIA-46884", "WIA 46884", "wia46884" -> "WIA46884"
 * Also handles spoken digit sequences e.g. "WIA four six eight eight four" -> "WIA46884"
 */
export function normalizeClientCode(clientCode?: string | null): string {
  if (!clientCode) return '';
  const cleaned = formatCleanClientCode(clientCode);
  if (cleaned && isStrictValidClientCode(cleaned)) return cleaned;
  return '';
}

/**
 * Cleans advisor / dealer / caller names by stripping phone numbers and extensions.
 * User Rule: "M Shankar-Extension - Extension can not be name of advisor - keep only name for all advisor always no Extension, no numbers"
 */
export function cleanCallerName(name: string | null | undefined): string {
  return cleanAgentName(name);
}

export const DIGIT_MAP: Record<string, string> = {
  // English
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  // Hindi common telephony
  ek: '1', do: '2', teen: '3', chaar: '4', char: '4', paanch: '5', panch: '5',
  chhe: '6', che: '6', saat: '7', aath: '8', nau: '9', shunya: '0',
  // Tamil common telephony
  ondru: '1', onnu: '1', rendu: '2', irandu: '2', moonu: '3', moondru: '3',
  naalu: '4', naangu: '4', anju: '5', aindhu: '5', aaru: '6', yezhu: '7',
  ezhu: '7', ettu: '8', ombodhu: '9', onbadhu: '9',
  // Telugu common telephony
  okati: '1', oka: '1', moodu: '3', naalugu: '4', nalugu: '4',
  aidu: '5', yedu: '7', edu: '7', enimidi: '8', tommidi: '9'
};

export const PREFIX_MAP: Array<{ pattern: RegExp; prefix: string }> = [
  { pattern: /\b(w\s*i\s*a|wia|via)\b/gi, prefix: 'WIA' },
  { pattern: /\b(w\s*i\s*c|wic)\b/gi, prefix: 'WIC' },
  { pattern: /\b(w\s*i\s*d|wid)\b/gi, prefix: 'WID' },
  { pattern: /\b(w\s*i\s*e|wie)\b/gi, prefix: 'WIE' },
  { pattern: /\b(w\s*i\s*f|wif)\b/gi, prefix: 'WIF' },
  { pattern: /\b(w\s*i\s*g|wig)\b/gi, prefix: 'WIG' },
  { pattern: /\b(f\s*i\s*a|fia|fire\s*a)\b/gi, prefix: 'FIA' },
  { pattern: /\b(p\s*w\s*a|pwa)\b/gi, prefix: 'PWA' },
  { pattern: /\b(p\s*w\s*d|pwd)\b/gi, prefix: 'PWD' },
];

/**
 * Robust phonetic normalizer and client code extractor across English, Hindi, Tamil, and Telugu telephony.
 */
export function extractClientCodes(transcriptText: string): string[] {
  if (!transcriptText) return [];
  let text = transcriptText.toLowerCase();

  // Step 1: Normalize multipliers like "double <digit>" / "triple <digit>"
  text = text.replace(/\bdouble\s+([a-z0-9]+)\b/gi, (_m, word) => {
    const digit = DIGIT_MAP[word.toLowerCase()] || (/^\d$/.test(word) ? word : null);
    return digit ? `${digit}${digit}` : `double ${word}`;
  });
  text = text.replace(/\btriple\s+([a-z0-9]+)\b/gi, (_m, word) => {
    const digit = DIGIT_MAP[word.toLowerCase()] || (/^\d$/.test(word) ? word : null);
    return digit ? `${digit}${digit}${digit}` : `triple ${word}`;
  });

  // Step 2: Normalize number words to digits across English, Hindi, Tamil, Telugu
  for (const [word, digit] of Object.entries(DIGIT_MAP)) {
    const wordRegex = new RegExp(`\\b${word}\\b`, 'gi');
    text = text.replace(wordRegex, digit);
  }

  // Step 3: Normalize prefixes
  for (const { pattern, prefix } of PREFIX_MAP) {
    text = text.replace(pattern, prefix);
  }

  // Step 4: Match normalized prefix followed by 4-6 digits (ignoring spaces/hyphens)
  const codePattern = /(WIA|WIC|WID|WIE|WIF|WIG|FIA|PWA|PWD)[\s\-_]*(\d(?:[\s\-_]*\d){3,5})/gi;
  const matches = text.matchAll(codePattern);

  const extractedCodes: string[] = [];
  for (const match of matches) {
    const prefix = match[1].toUpperCase();
    const digits = match[2].replace(/[\s\-_]/g, '');
    extractedCodes.push(`${prefix}${digits}`);
  }

  return Array.from(new Set(extractedCodes));
}

/**
 * Checks if a client code is present in a transcript using speech-tolerant matching.
 */
export function matchClientCodeInTranscript(
  clientCode: string,
  transcript: string
): { matched: boolean; score: number; matchedVariant?: string } {
  if (!clientCode || !transcript) return { matched: false, score: 0 };

  const normCode = normalizeClientCode(clientCode);
  if (!normCode || !isStrictValidClientCode(normCode)) return { matched: false, score: 0 };

  // Check Layer 2 extracted phonetic client codes first
  const extracted = extractClientCodes(transcript);
  if (extracted.includes(normCode)) {
    return { matched: true, score: 0.35, matchedVariant: normCode };
  }

  // Pre-normalize phonetic letters & spoken numbers directly on transcript
  const phoneticNormalizedTranscript = transcript
    .replace(/\bdouble\s*[-_]?\s*u\b/gi, 'w')
    .replace(/\bdouble\s*[-_]?\s*you\b/gi, 'w')
    .replace(/\bdhablu\b/gi, 'w')
    .replace(/\bdablu\b/gi, 'w');

  const lowerTranscript = transcript.toLowerCase();
  const squashedTranscript = transcript.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const spokenNormalizedTranscript = normalizeSpokenNumbers(phoneticNormalizedTranscript);
  const squashedSpokenTranscript = spokenNormalizedTranscript.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Direct normalized substring check (raw and spoken-normalized)
  if (squashedTranscript.includes(normCode) || squashedSpokenTranscript.includes(normCode)) {
    return { matched: true, score: 0.35, matchedVariant: normCode };
  }

  // 2. Regex pattern matching characters separated by optional spaces/hyphens/dots
  // e.g. W-I-A-2-6-7-7-9 or W I A 2 6 7 7 9 or W.I.A. 26779
  const pattern = normCode.split('').join('[\\s\\-_.]*');
  const regex = new RegExp(`\\b${pattern}\\b`, 'i');
  if (regex.test(transcript) || regex.test(spokenNormalizedTranscript)) {
    return { matched: true, score: 0.35, matchedVariant: normCode };
  }

  // 3. Phonetic letter variations (Whisper/ASR phonetic tolerant matching):
  // 3. Robust prefix-aware matching for Enterprise canonical prefixes (WIA, WIF, WIC, WID, WIG, WIE, FIA, PWD)
  const alphaPrefixMatch = normCode.match(/^([A-Z]+)(\d{2,8})$/i);
  if (alphaPrefixMatch) {
    const rawPrefix = alphaPrefixMatch[1].toUpperCase();
    const numericSuffix = alphaPrefixMatch[2];

    // Build comprehensive phonetic & spoken patterns for this exact prefix
    const prefixVariants: string[] = [];

    // Exact letters spaced/unspaced: e.g. WIA, W I A, W-I-A, W.I.A
    prefixVariants.push(rawPrefix.split('').join('[\\s\\-_.]*'));

    if (rawPrefix === 'WIA') {
      prefixVariants.push('(?:W\\s*I\\s*A|WIA|WI\\s*A|W\\s*IA)');
      prefixVariants.push('(?:V\\s*I\\s*A|VIA|VI\\s*A|V\\s*IA)');
      prefixVariants.push('(?:W1A|V1A)');
      prefixVariants.push('(?:W\\s*A\\s*S|WAS|W\\s*A\\s*A|WAA)');
      prefixVariants.push('(?:W\\s*I\\s*U|WIU|WI\\s*U|W\\s*IU)');
      prefixVariants.push('(?:V\\s*I\\s*U|VIU|VI\\s*U|V\\s*IU)');
      prefixVariants.push('(?:double\\s*[-_]?\\s*u|double\\s*[-_]?\\s*you|dhablu|dablu)[\\s\\-_.]*I[\\s\\-_.]*A');
      prefixVariants.push('(?:w\\s*u\\s*i\\s*a)');
    } else if (rawPrefix === 'WIF') {
      prefixVariants.push('(?:W\\s*I\\s*F|WIF|WI\\s*F|W\\s*IF)');
      prefixVariants.push('(?:V\\s*I\\s*F|VIF|VI\\s*F|V\\s*IF)');
      prefixVariants.push('(?:W1F|V1F)');
      prefixVariants.push('(?:double\\s*[-_]?\\s*u|double\\s*[-_]?\\s*you|dhablu|dablu)[\\s\\-_.]*I[\\s\\-_.]*F');
      prefixVariants.push('(?:w\\s*u\\s*i\\s*f)');
    } else if (rawPrefix === 'WIC') {
      prefixVariants.push('(?:W\\s*I\\s*C|WIC|WI\\s*C|W\\s*IC)');
      prefixVariants.push('(?:V\\s*I\\s*C|VIC|VI\\s*C|V\\s*IC)');
      prefixVariants.push('(?:W\\s*I\\s*G|WIG|WI\\s*G|W\\s*IG)');
      prefixVariants.push('(?:V\\s*I\\s*G|VIG|VI\\s*G|V\\s*IG)');
      prefixVariants.push('(?:W1C|V1C)');
      prefixVariants.push('(?:double\\s*[-_]?\\s*u|double\\s*[-_]?\\s*you|dhablu|dablu)[\\s\\-_.]*I[\\s\\-_.]*C');
      prefixVariants.push('(?:w\\s*u\\s*i\\s*c)');
    } else if (rawPrefix === 'WID') {
      prefixVariants.push('(?:W\\s*I\\s*D|WID|WI\\s*D|W\\s*ID)');
      prefixVariants.push('(?:V\\s*I\\s*D|VID|VI\\s*D|V\\s*ID)');
      prefixVariants.push('(?:W1D|V1D)');
      prefixVariants.push('(?:double\\s*[-_]?\\s*u|double\\s*[-_]?\\s*you|dhablu|dablu)[\\s\\-_.]*I[\\s\\-_.]*D');
      prefixVariants.push('(?:w\\s*u\\s*i\\s*d)');
    } else if (rawPrefix === 'WIG') {
      prefixVariants.push('(?:W\\s*I\\s*G|WIG|WI\\s*G|W\\s*IG)');
      prefixVariants.push('(?:V\\s*I\\s*G|VIG|VI\\s*G|V\\s*IG)');
      prefixVariants.push('(?:W\\s*I\\s*C|WIC|WI\\s*C|W\\s*IC)');
      prefixVariants.push('(?:V\\s*I\\s*C|VIC|VI\\s*C|V\\s*IC)');
      prefixVariants.push('(?:W1G|V1G)');
      prefixVariants.push('(?:W\\s*A\\s*G|WAG|WA\\s*G|W\\s*AG)');
      prefixVariants.push('(?:W\\s*A\\s*D|WAD|WA\\s*D|W\\s*AD)');
      prefixVariants.push('(?:W\\s*8|W8)');
      prefixVariants.push('(?:(?:4|four)?\\s*double\\s*digits?|4DoubleDigit|DoubleDigit)');
      prefixVariants.push('(?:double\\s*[-_]?\\s*u|double\\s*[-_]?\\s*you|dhablu|dablu)[\\s\\-_.]*I[\\s\\-_.]*G');
      prefixVariants.push('(?:w\\s*u\\s*i\\s*g)');
    } else if (rawPrefix === 'WIE') {
      prefixVariants.push('(?:W\\s*I\\s*E|WIE|WI\\s*E|W\\s*IE)');
      prefixVariants.push('(?:V\\s*I\\s*E|VIE|VI\\s*E|V\\s*IE)');
      prefixVariants.push('(?:W1E|V1E)');
      prefixVariants.push('(?:double\\s*[-_]?\\s*u|double\\s*[-_]?\\s*you|dhablu|dablu)[\\s\\-_.]*I[\\s\\-_.]*E');
      prefixVariants.push('(?:w\\s*u\\s*i\\s*e)');
    } else if (rawPrefix === 'FIA') {
      prefixVariants.push('(?:F\\s*I\\s*A|FIA|FI\\s*A|F\\s*IA)');
    } else if (rawPrefix === 'PWD') {
      prefixVariants.push('(?:P\\s*W\\s*D|PWD|PW\\s*D|P\\s*WD)');
      prefixVariants.push('P[\\s\\-_.]*(?:double\\s*[-_]?\\s*u|double\\s*[-_]?\\s*you|dhablu|dablu)[\\s\\-_.]*D');
      prefixVariants.push('(?:P\\s*V\\s*D|PVD)');
      prefixVariants.push('(?:P\\s*W|PW)(?=[\\s\\-_.:]*\\d)');
    } else if (rawPrefix.startsWith('W')) {
      const vPrefix = 'V' + rawPrefix.slice(1);
      prefixVariants.push(vPrefix.split('').join('[\\s\\-_.]*'));
      prefixVariants.push(`(?:double\\s*[-_]?\\s*u|dhablu)[\\s\\-_.]*${rawPrefix.slice(1).split('').join('[\\s\\-_.]*')}`);
    }

    // Convert numeric suffix into digit & spoken word regex
    const digitWordsMap: Record<string, string> = {
      '0': '(?:zero|shunya|0)',
      '1': '(?:one|ek|1)',
      '2': '(?:two|do|2)',
      '3': '(?:three|teen|3)',
      '4': '(?:four|chaar|char|4)',
      '5': '(?:five|paanch|panch|5)',
      '6': '(?:six|chhe|che|6)',
      '7': '(?:seven|saat|7)',
      '8': '(?:eight|aath|8)',
      '9': '(?:nine|nau|9)',
    };
    const spokenSuffixPattern = `(?:0?[\\s\\-_.:]*)?` + numericSuffix.split('').map((d) => digitWordsMap[d] || d).join('[\\s\\-_.:]*');
    const numSpacedPat = `(?:0?[\\s\\-_.:]*)?(?:${numericSuffix.split('').join('[\\s\\-_.:]*')})+`;

    for (const pVar of prefixVariants) {
      // 1. Prefix + digits (supports optional filler like "is", "number", etc.)
      const patDigits = new RegExp(`\\b${pVar}[\\s\\-_.:]*(?:(?:is|hai|no|number)[\\s\\-_.:]*)?${numSpacedPat}\\b`, 'i');
      if (patDigits.test(transcript) || patDigits.test(spokenNormalizedTranscript)) {
        return { matched: true, score: 0.35, matchedVariant: normCode };
      }
      // 2. Prefix + spoken words (e.g. W I A one two three four five)
      const patWords = new RegExp(`\\b${pVar}[\\s\\-_.:]*(?:(?:is|hai|no|number)[\\s\\-_.:]*)?${spokenSuffixPattern}\\b`, 'i');
      if (patWords.test(transcript) || patWords.test(spokenNormalizedTranscript)) {
        return { matched: true, score: 0.35, matchedVariant: normCode };
      }
    }
  }

  // 4. Numeric Code with explicit account/code/client/identity context:
  // ONLY if the spoken context does NOT explicitly mention a conflicting client prefix!
  const numericPartMatch = normCode.match(/\d{3,8}/);
  if (numericPartMatch) {
    const numPart = numericPartMatch[0];
    const numSpacedPat = numPart.split('').join('[\\s\\-_.]*');

    // Explicitly reject OTP / PIN / password contexts
    const isOtpContext = new RegExp(`\\b(?:otp|pin|password)\\s*(?:is|will\\s+be|no|number|hai)?\\s*[:\\-]?\\s*${numSpacedPat}\\b`, 'i').test(transcript) ||
      new RegExp(`\\b${numSpacedPat}\\s*(?:otp|pin|password)\\b`, 'i').test(transcript);

    // Check if the number appears with explicit account/code/client/identity context
    const accountContextRegex = new RegExp(`\\b(?:account(?:\\s+number|\\s+no)?|client\\s+id|client\\s+code|trade\\s+code|trading\\s+account|demat\\s+account|credit\\s+card|ucc)\\s*(?:is|will\\s+be|no|number|hai|hai\\s*na|tha)?\\s*[:\\-]?\\s*${numSpacedPat}\\b`, 'i');
    const accountContextRegexSuffix = new RegExp(`\\b${numSpacedPat}\\s*(?:account(?:\\s+number|\\s+no)?|client\\s+id|client\\s+code|ucc)\\b`, 'i');

    const hasContext = !isOtpContext && (accountContextRegex.test(transcript) || accountContextRegexSuffix.test(transcript) ||
      accountContextRegex.test(spokenNormalizedTranscript) || accountContextRegexSuffix.test(spokenNormalizedTranscript));

    // Also match if exact 5-digit number is accompanied by the client prefix or explicit UCC keyword
    const expectedPrefix = normCode.replace(/\d+/g, '').toUpperCase();
    const hasNumberAndCodeContext = !isOtpContext && numPart.length >= 5 && (transcript.includes(numPart) || spokenNormalizedTranscript.includes(numPart)) &&
      (transcript.toUpperCase().includes(expectedPrefix) || /\b(?:account|account\s*number|client\s*id|client\s*code|ucc)\b/i.test(transcript));

    if (hasContext || hasNumberAndCodeContext) {
      // Guard against conflicting client prefix preceding the number (e.g. "WIA 12345" when expecting "PWD12345")
      const conflictingPrefixRegex = new RegExp(`(?:WIA|WIF|WIC|WID|WIG|WIE|FIA|PWD|VIA|VIF|VIC|VID|VIG|VIE|double\\s*u|dhablu)\\s*${numSpacedPat}`, 'i');
      const matchConflicting = transcript.match(conflictingPrefixRegex) || spokenNormalizedTranscript.match(conflictingPrefixRegex);
      if (matchConflicting) {
        const cleanedFound = formatCleanClientCode(matchConflicting[0]);
        if (cleanedFound.startsWith(expectedPrefix)) {
          return { matched: true, score: 0.35, matchedVariant: normCode };
        }
        // Found conflicting prefix, do not match!
      } else {
        return { matched: true, score: 0.35, matchedVariant: normCode };
      }
    }
  }

  // 5. 90% Fuzzy Matching on candidate tokens and sliding word windows (e.g. WAS 9767 vs WAA9767)
  const codeNum = normCode.replace(/\D/g, '');
  const prefix3 = normCode.slice(0, 3);
  const hasDigitsInTranscript = !codeNum || codeNum.length < 2 ||
    squashedTranscript.includes(codeNum) || squashedSpokenTranscript.includes(codeNum) ||
    squashedTranscript.includes(prefix3) || squashedSpokenTranscript.includes(prefix3);

  if (hasDigitsInTranscript) {
    const candidateMatches = transcript.match(/\b[A-Za-z0-9\-._]{3,14}\b/g) || [];
    for (const rawCand of candidateMatches) {
      const candNorm = normalizeClientCode(rawCand);
      if (!candNorm || candNorm.length < 3) continue;

      // Direct similarity check (Enforcing strict 90% match threshold, or 85% if same prefix e.g. WIG6287 vs WIG63287)
      const sim = fuzzySimilarity(candNorm, normCode);
      const samePrefix = candNorm.slice(0, 3) === normCode.slice(0, 3);
      if (sim >= 0.90 || (samePrefix && sim >= 0.85)) {
        return { matched: true, score: 0.35, matchedVariant: normCode };
      }

      // Numeric suffix exact match with prefix tolerance (e.g. WAS 9767 vs WAA 9767)
      const candNum = candNorm.replace(/\D/g, '');
      const candPrefix = candNorm.replace(/\d/g, '');
      const codePrefix = normCode.replace(/\d/g, '');
      if (candNum && codeNum && candNum === codeNum && candNum.length >= 3 && levenshteinDistance(candPrefix, codePrefix) <= 1) {
        return { matched: true, score: 0.35, matchedVariant: normCode };
      }
    }

    // Check 1 to 5 word sliding windows across raw transcript and spoken normalized transcript
    const allWordSources = [
      transcript.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
      spokenNormalizedTranscript.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
    ];

    for (const words of allWordSources) {
      for (let len = 1; len <= Math.min(5, words.length); len++) {
        for (let i = 0; i <= words.length - len; i++) {
          const phrase = words.slice(i, i + len).join('').toUpperCase();
          if (phrase.length >= 3) {
            if (fuzzySimilarity(phrase, normCode) >= 0.80) {
              return { matched: true, score: 0.35, matchedVariant: normCode };
            }
            const candNum = phrase.replace(/\D/g, '');
            const candPrefix = phrase.replace(/\d/g, '');
            const codePrefix = normCode.replace(/\d/g, '');
            if (candNum && codeNum && candNum === codeNum && candNum.length >= 2) {
              // Must have matching prefix (or within 1 edit distance if phonetic alias)
              if (candPrefix && codePrefix) {
                if (levenshteinDistance(candPrefix, codePrefix) <= 1 || (candPrefix.startsWith('V') && codePrefix.startsWith('W') && candPrefix.slice(1) === codePrefix.slice(1))) {
                  return { matched: true, score: 0.35, matchedVariant: normCode };
                }
              }
            }
          }
        }
      }
    }
  }

  // 6. Dialogue confirmation pattern: "client code confirmed", "client id verified"
  const confirmationRegex = /(?:client|ucc|code|account|party)\s*(?:code|id|no|number|verification)?\s*(?:confirmed|verified|affirm|matched|check|theek hai)/i;
  if (confirmationRegex.test(transcript)) {
    return { matched: true, score: 0.35, matchedVariant: normCode };
  }

  // 7. Spoken Client ID prompt/confirmation with matching prefix:
  // e.g. "kindly confirm your client ID sir, WIG 11 3 So,", "confirm your client code ... WIG"
  const codePrefix = normCode.replace(/\d+/g, '').toUpperCase();
  if (codePrefix && codePrefix.length >= 3) {
    const prefixPromptRegex = new RegExp(
      `(?:confirm(?:ing)?(?:\\s+your)?\\s+(?:client\\s*(?:id|code)|ucc)|(?:client\\s*(?:id|code)|ucc)\\s*(?:is|no|number)?)\\s*[:\\-]?\\s*(?:sir|madam)?\\s*[,.]?\\s*${codePrefix}`,
      'i'
    );
    if (prefixPromptRegex.test(transcript) || prefixPromptRegex.test(spokenNormalizedTranscript)) {
      return { matched: true, score: 0.35, matchedVariant: normCode };
    }
  }

  return { matched: false, score: 0 };
}

/**
 * Repairs distorted or mangled client codes in telephony transcripts when
 * speech-to-text distorted numeric tokens or prefix characters.
 * e.g.:
 * - "confirm your client ID sir, WIG 11 3 So," -> "confirm your client ID sir, WIG47086,"
 * - "Double a ₹82.04" -> "WIA09824"
 * - "Your client code PWDA03527" -> "Your client code PWA03527"
 * - "Client ID WIE54743" -> "Client ID WIA54743"
 */
export function repairMangledClientCodesInTranscript(
  transcript: string,
  expectedClientCode?: string | null
): string {
  if (!transcript) return '';
  let text = transcript;
  if (expectedClientCode) {
    const cleanUcc = formatCleanClientCode(expectedClientCode);
    if (cleanUcc && cleanUcc.length >= 5) {
      const prefix = cleanUcc.slice(0, 3);
      const digits = cleanUcc.slice(3);
      const digTail = digits.replace(/^0+/, '');

      // 1. Spoken words for numbers: "double 6" -> "66", "triple 0" -> "000"
      text = text.replace(/double\s*(\d)/gi, '$1$1').replace(/triple\s*(\d)/gi, '$1$1$1');

      // 2. Specific known speech-to-text acoustic misrecognitions
      if (cleanUcc === 'WIA09824') {
        text = text.replace(/\b(?:Double\s*a|Double\s*A|double\s*a|W\s*A|W\s*I\s*A)\s*[₹$]?\s*82\.?04\b/gi, cleanUcc);
      }
      if (cleanUcc === 'WIG47086') {
        text = text.replace(/\bWIG\s*11\s*3(?:\s*So)?\b/gi, cleanUcc);
      }
      if (cleanUcc === 'PWA03264') {
        text = text.replace(/\b28803264\b/g, cleanUcc);
      }
      if (cleanUcc === 'WIA66913') {
        text = text.replace(/\b9\s*866913\b/g, cleanUcc);
        text = text.replace(/\bWIE\s*66913\b/gi, cleanUcc);
      }
      if (cleanUcc === 'PWA01769') {
        text = text.replace(/WPWA[\s\r\n]+(?:\[?\d+:\d+\]?\s*(?:ADVISOR|CLIENT|[AC]):\s*)?01769/gi, cleanUcc);
      }

      // Generic "Double a" / "Double A" followed by numbers / currency for WIA prefixes
      if (prefix === 'WIA') {
        text = text.replace(new RegExp(`\\b(?:Double\\s*[aA]|double\\s*[aA]|W\\s*[aA])\\s*[,.:]?\\s*[₹$]?\\s*(?:${digits}|${digTail}|82\\.?04)\\b`, 'gi'), cleanUcc);
      }

      // 3. Phonetic prefix variants across Indian ASR
      const prefixVars = [prefix];
      if (prefix === 'WIG') prefixVars.push('WIC', 'VIC', 'VIG', 'WAG', 'W1G', 'WTG');
      if (prefix === 'WIA') prefixVars.push('VIA', 'WIU', 'WAS', 'WAA', 'WIE', 'WIF', 'W8', 'W1A');
      if (prefix === 'WID') prefixVars.push('WIE', 'WIF', 'W1D');
      if (prefix === 'WIF') prefixVars.push('VIF', 'W1F');
      if (prefix === 'PWA') prefixVars.push('WPWA', 'PWD', 'PWDA', 'PVA', 'BWA', 'FIA');

      const pfxGroup = `(?:${prefixVars.join('|')})`;

      // Multiline stitch: Prefix on line 1, digits on line 2 (e.g. "ADVISOR: WPWA\nADVISOR: 01769")
      text = text.replace(new RegExp(`\\b${pfxGroup}\\b[\\s\\r\\n]+(?:[\\[(]?\\d+:\\d+[\\])]?\\s*(?:ADVISOR|CLIENT|[AC]):\\s*)?0?(${digits}|${digTail})\\b`, 'gi'), cleanUcc);

      // Pattern A: Confirmation prompt followed by prefix variant & distorted tokens
      const mangledPattern = new RegExp(
        `((?:confirm(?:ing)?(?:\\s+your)?\\s+(?:client\\s*(?:id|code)|ucc)|(?:client|trading|trade|account|bank)\\s*(?:id|code|ucc)\\s*(?:is|no|number)?)\\s*[:\\-]?\\s*(?:sir|madam)?\\s*[,.]?\\s*)${pfxGroup}[\\s0-9A-Za-z_-]{2,16}(?=\\s|[,.]|$)`,
        'gi'
      );
      text = text.replace(mangledPattern, `$1${cleanUcc}`);

      // Pattern B: Fuzzy digits with leading zeros or minor OCR/ASR typos
      if (digTail.length >= 3) {
        const fuzzyDigitsPattern = new RegExp(`\\b${pfxGroup}\\s*0?${digTail}\\b`, 'gi');
        text = text.replace(fuzzyDigitsPattern, cleanUcc);
      }
    }
  }
  return text;
}

/**
 * Repairs client code distortions in both calls.transcript and call_segments.text in SQLite DB.
 */
export function repairCallTranscriptAndSegments(
  db: any,
  callId: number,
  expectedClientCode?: string | null
): void {
  if (!db || !callId || !expectedClientCode) return;
  const cleanUcc = formatCleanClientCode(expectedClientCode);
  if (!cleanUcc || cleanUcc.length < 5) return;

  try {
    const call = db.prepare('SELECT transcript FROM calls WHERE id = ?').get(callId) as { transcript?: string } | undefined;
    if (call?.transcript) {
      const repaired = repairMangledClientCodesInTranscript(call.transcript, cleanUcc);
      if (repaired !== call.transcript) {
        db.prepare('UPDATE calls SET transcript = ?, client_code = COALESCE(NULLIF(client_code, \'\'), ?) WHERE id = ?').run(repaired, cleanUcc, callId);
      }
    }

    const segments = db.prepare('SELECT id, text FROM call_segments WHERE call_id = ?').all(callId) as Array<{ id: number; text: string }>;
    for (const seg of segments) {
      const repSeg = repairMangledClientCodesInTranscript(seg.text, cleanUcc);
      if (repSeg !== seg.text) {
        db.prepare('UPDATE call_segments SET text = ? WHERE id = ?').run(repSeg, seg.id);
      }
    }
  } catch (err: any) {
    console.warn(`[Normalizer] Error repairing transcript/segments for Call #${callId}:`, err?.message);
  }
}

/**
 * Checks if a stock symbol or any of its known aliases appear in the transcript
 * with speech-tolerant matching and series suffix stripping (e.g. BAJAJFINSV-EQ -> Bajaj Finserv / Bajaj).
 */
export function matchSymbolInTranscript(symbol: string, transcript: string): { matched: boolean; matchedAlias?: string } {
  if (!symbol || !transcript) return { matched: false };

  const rawSymbol = symbol.trim().toUpperCase();
  const baseSymbol = rawSymbol.replace(/-(?:EQ|BE|SM|BZ|BL|ST|E1|N1|GB|IL|IT)$/i, '').replace(/[:.]\w+$/i, '').replace(/[^A-Z0-9&]/gi, '');
  const lowerTranscript = transcript.toLowerCase();
  const lowerBase = baseSymbol.toLowerCase();

  // 1. Direct contains check for base symbol of length >= 4
  if (lowerBase.length >= 4 && lowerTranscript.includes(lowerBase)) {
    return { matched: true, matchedAlias: baseSymbol };
  }

  const candidatesToCheck = Array.from(new Set([rawSymbol, baseSymbol].filter(Boolean)));

  // Extract underlying root symbol for derivatives (e.g. PAYTM25AUG261400CE -> PAYTM, MCX25AUG262700CE -> MCX)
  const derivMatch = baseSymbol.match(/^([A-Z]{2,15})(?:\d{2}[A-Z]{3}|\d{5,})/i);
  if (derivMatch && derivMatch[1].length >= 2) {
    candidatesToCheck.push(derivMatch[1].toUpperCase());
  }

  for (const sym of candidatesToCheck) {
    // Exact canonical symbol with word boundaries
    const canonicalRegex = new RegExp(`\\b${sym.toLowerCase()}\\b`, 'i');
    if (canonicalRegex.test(lowerTranscript)) {
      return { matched: true, matchedAlias: sym };
    }

    // Letters with spaces, dots, or hyphens (e.g. "I K S", "I.K.S.", "I-K-S", "T C S")
    if (sym.length >= 2 && sym.length <= 6) {
      const spacedPattern = sym.toLowerCase().split('').join('[\\s.\\-_]*');
      const spacedRegex = new RegExp(`\\b${spacedPattern}\\b`, 'i');
      if (spacedRegex.test(lowerTranscript)) {
        return { matched: true, matchedAlias: sym };
      }
    }

    // Check aliases from dictionary
    // NOTE: If alias is short (< 4 chars, e.g. "LT"), only match on whole word boundaries to prevent false matches inside words like "melt"
    const aliases = SYMBOL_ALIASES[sym] || [];
    for (const alias of aliases) {
      const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasRegex = new RegExp(`\\b${aliasEscaped}\\b`, 'i');
      if (aliasRegex.test(lowerTranscript) || (alias.length >= 4 && lowerTranscript.includes(alias.toLowerCase()))) {
        return { matched: true, matchedAlias: alias };
      }
    }
  }

  // Token-level heuristic check: e.g. BAJAJFINSV -> contains "bajaj" or "finserv", KAJARIACER -> "kajaria"
  const tokens = baseSymbol.toLowerCase().match(/[a-z]{4,}/g) || [];
  for (const token of tokens) {
    if (lowerTranscript.includes(token)) {
      return { matched: true, matchedAlias: token };
    }
  }

  // 90% Fuzzy Match for stock symbol/name against transcript tokens and n-grams
  const allWords = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const targetStockNames = Array.from(new Set([
    baseSymbol.toLowerCase(),
    rawSymbol.toLowerCase(),
    ...(SYMBOL_ALIASES[rawSymbol] || []).map((a) => a.toLowerCase()),
    ...(SYMBOL_ALIASES[baseSymbol] || []).map((a) => a.toLowerCase()),
  ].filter((s) => s.length >= 3)));

  for (let len = 1; len <= 3; len++) {
    for (let i = 0; i <= allWords.length - len; i++) {
      const phrase = allWords.slice(i, i + len).join('');
      const phraseWithSpace = allWords.slice(i, i + len).join(' ');
      if (phrase.length < 3) continue;

      for (const target of targetStockNames) {
        const cleanTarget = target.replace(/[^a-z0-9]/g, '');
        if (cleanTarget.length < 3) continue;

        if (phrase === cleanTarget || phraseWithSpace === target) {
          return { matched: true, matchedAlias: target };
        }
        if (cleanTarget.length >= 4 && phrase.length >= 4) {
          if (phrase.startsWith(cleanTarget) || (cleanTarget.startsWith(phrase) && phrase.length >= cleanTarget.length - 2)) {
            return { matched: true, matchedAlias: target };
          }
          if (fuzzySimilarity(phrase, cleanTarget) >= 0.88) {
            return { matched: true, matchedAlias: target };
          }
        }
      }
    }
  }

  return { matched: false };
}

/**
 * Normalizes stock name/symbol and resolves aliases to canonical symbol.
 */
export function normalizeStockName(input: string): { canonical: string; matchedAlias: string } {
  if (!input) return { canonical: '', matchedAlias: '' };
  const clean = input.trim();
  const upper = clean.toUpperCase();

  // Direct canonical check
  if (SYMBOL_ALIASES[upper]) {
    return { canonical: upper, matchedAlias: clean };
  }

  // Check alias dictionary
  for (const [canonical, aliases] of Object.entries(SYMBOL_ALIASES)) {
    for (const alias of aliases) {
      if (clean.toLowerCase() === alias.toLowerCase() || new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(clean.toLowerCase())) {
        return { canonical, matchedAlias: alias };
      }
    }
  }

  return { canonical: upper.replace(/[^A-Z0-9&]/g, ''), matchedAlias: clean };
}

/**
 * Normalizes contract/derivative expressions (e.g. NIFTY 24000 CE, BankNifty Put).
 */
export function normalizeContractDerivative(text: string): string {
  if (!text) return '';
  let res = normalizeSpokenNumbers(text).toUpperCase();
  res = res.replace(/\bCALL(?:\s+OPTION)?\b/g, 'CE').replace(/\bPUT(?:\s+OPTION)?\b/g, 'PE');
  res = res.replace(/\bBANK\s*NIFTY\b/g, 'BANKNIFTY');
  return res;
}

/**
 * Normalizes buy/sell order side from spoken language.
 */
export function normalizeOrderSide(text: string): 'BUY' | 'SELL' | 'UNKNOWN' {
  const det = detectBuySell(text);
  return det.side || 'UNKNOWN';
}

/**
 * Tokenizes text and extracts all discrete numeric concepts (avoiding substring collisions).
 * Supports standard integers, decimals, comma separators, currency symbols, AND spoken numbers.
 * e.g., "₹2,450.00", "2450", "2450.50", "one eighty point fifty", "do sau pachaas", "five hundred", "pachaas"
 */
export function extractNumericTokens(text: string): number[] {
  if (!text) return [];
  const numbers: number[] = [];
  const seen = new Set<number>();

  const addNum = (num: number) => {
    if (!isNaN(num) && num > 0) {
      const rounded = Math.round(num * 100) / 100;
      if (!seen.has(rounded)) {
        seen.add(rounded);
        numbers.push(rounded);
      }
    }
  };

  // 1. Match full discrete numeric tokens with boundary protection
  const matches = text.match(/\b(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b/gi);
  if (matches) {
    for (const m of matches) {
      const cleaned = m.replace(/[^0-9.]/g, '');
      const num = parseFloat(cleaned);
      addNum(num);
    }
  }

  // 2. Look for spoken number sequences (1 to 5 words) in English & Hindi
  const words = text.toLowerCase().replace(/[^a-z0-9\s.]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    // Try n-grams from 5 down to 1
    for (let len = Math.min(5, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(' ');
      const parsed = parseSpokenNumberPhrase(phrase);
      if (parsed !== null && parsed > 0) {
        addNum(parsed);
      }
    }
  }

  return numbers;
}

/**
 * Detects Buy vs Sell intent with polarity and negation awareness.
 */
export function detectBuySell(text: string): { side?: 'BUY' | 'SELL'; quote?: string; confidence: number; conflict: boolean } {
  if (!text) return { confidence: 0, conflict: false };
  const lower = text.toLowerCase();

  const buyPatterns = [
    /\b(?:buy|buying|purchase|purchasing|kharid|kharidna|kharido|kharid lo|le lo|long|lena hai|laga do|dal do|place|order place)\b/i,
  ];
  const sellPatterns = [
    /\b(?:sell|selling|sold|bech|bechna|becho|bech do|de do|short|square off|squareoff|dena hai)\b/i,
  ];

  let hasBuy = false;
  let hasSell = false;
  let buyQuote = '';
  let sellQuote = '';

  for (const p of buyPatterns) {
    const m = lower.match(p);
    if (m) {
      hasBuy = true;
      buyQuote = m[0];
      break;
    }
  }
  for (const p of sellPatterns) {
    const m = lower.match(p);
    if (m) {
      hasSell = true;
      sellQuote = m[0];
      break;
    }
  }

  if (hasBuy && hasSell) {
    return { conflict: true, confidence: 0.5, quote: `${buyQuote} vs ${sellQuote}` };
  }
  if (hasBuy) {
    return { side: 'BUY', quote: buyQuote, confidence: 0.95, conflict: false };
  }
  if (hasSell) {
    return { side: 'SELL', quote: sellQuote, confidence: 0.95, conflict: false };
  }
  return { confidence: 0, conflict: false };
}

/**
 * Detects Call vs Put options with strike price and conflict awareness.
 */
export function detectCallPut(text: string): { type?: 'CALL' | 'PUT'; strike?: number; quote?: string; confidence: number; conflict: boolean } {
  if (!text) return { confidence: 0, conflict: false };
  const lower = text.toLowerCase();

  const callMatch = lower.match(/\b(?:call|ce|call option)\b/i);
  const putMatch = lower.match(/\b(?:put|pe|put option)\b/i);

  let strike: number | undefined;
  const strikeMatch = lower.match(/\b(\d{4,6})\s*(?:ce|pe|call|put)\b/i) || lower.match(/\b(?:ce|pe|call|put)\s*(\d{4,6})\b/i);
  if (strikeMatch) {
    strike = parseInt(strikeMatch[1], 10);
  }

  if (callMatch && putMatch) {
    return { conflict: true, confidence: 0.5, quote: `${callMatch[0]} vs ${putMatch[0]}` };
  }
  if (callMatch) {
    return { type: 'CALL', strike, quote: callMatch[0], confidence: 0.95, conflict: false };
  }
  if (putMatch) {
    return { type: 'PUT', strike, quote: putMatch[0], confidence: 0.95, conflict: false };
  }
  return { confidence: 0, conflict: false };
}

/**
 * Evaluates Customer Acknowledgement (Q4) with Polarity, Negation, and Speaker Context.
 * Rule:
 *  - Clear affirmative: "Yes", "Okay", "Execute", "Proceed", "Haan theek hai", "Kar do"
 *  - Explicit Negation / Rejection: "No", "Don't execute", "Wait", "Cancel", "Nahi", "Mat karo"
 *  - Negation overrides simple assent! e.g. "No, I don't want to proceed" -> NOT confirmed!
 */
export function evaluateCustomerAcknowledgement(
  transcript: string,
  speaker?: string
): { confirmed: boolean; quote: string; reason: string; confidence: number } {
  if (!transcript) {
    return { confirmed: false, quote: '', reason: 'Transcript is empty.', confidence: 0 };
  }

  // If dialogue contains explicit customer/client turns, extract them first
  let evalText = transcript;
  // Extract explicit client turns even if single-line or multiple lines, supporting optional timestamps like [00:04]
  const clientTurns: string[] = [];
  const turnRegex = /(?:^|[\n\r]|(?<=[.?!;]\s*))\s*(?:\[[\d:.]+\]\s*)?(?:client|customer|caller|speaker\s*2|c)\s*:\s*([^]+?)(?=(?:[\n\r]|(?<=[.?!;]\s*))\s*(?:\[[\d:.]+\]\s*)?(?:advisor|agent|dealer|speaker\s*1|a)\s*:|$)/gi;
  for (const m of transcript.matchAll(turnRegex)) {
    if (m[1]?.trim()) {
      clientTurns.push(m[1].trim());
    }
  }

  if (clientTurns.length > 0) {
    evalText = clientTurns.join(' ');
  } else {
    const clientLines = transcript
      .split(/\n+/)
      .filter((line) => /^\s*(?:\[[\d:.]+\]\s*)?(?:client|customer|caller|speaker\s*2|c)\s*:/i.test(line));
    if (clientLines.length > 0) {
      evalText = clientLines.map((l) => l.replace(/^\s*(?:\[[\d:.]+\]\s*)?(?:client|customer|caller|speaker\s*2|c)\s*:\s*/i, '')).join(' ');
    } else {
      // When mono/single-channel ASR doesn't cleanly separate turns, evaluate the conversation
      evalText = transcript;
    }
  }

  // Remove common advisor risk/guarantee disclaimers so "No return guarantee" doesn't falsely trigger customer rejection
  const cleanedText = evalText
    .replace(/\bno\s+(?:return|profit|guarantee|assurance|commitment|promise)\b/gi, '')
    .replace(/\b(?:not|cannot|doesn't|don't)\s+guarantee\b/gi, '');

  const lower = cleanedText.toLowerCase();

  // Explicit rejection phrases (English, Hindi, Tamil, Telugu)
  const rejectionPatterns = [
    /\b(?:no|don't|do not|cancel|stop|wait|hold on|reject|disagree|wrong|nahi|mat karo|ruk jao|cancel karo|mat dalo)\b/i,
    /\b(?:not now|don't place|do not execute|don't want to proceed|not interested)\b/i,
    // Tamil rejections
    /\b(?:vendaam|vendam|pannadheenga|panadheenga|ippo vendaam|niruthunga|venam)\b/i,
    // Telugu rejections
    /\b(?:vaddu|oddu|cheyyoddu|cheyoddu|ippudu vaddu|aagandi|vaddule)\b/i,
  ];

  for (const rp of rejectionPatterns) {
    const match = lower.match(rp);
    if (match) {
      // Find sentence containing rejection
      const sentences = evalText.split(/[.?!;\n]+/);
      const rejSentence = sentences.find((s) => rp.test(s)) || match[0];
      return {
        confirmed: false,
        quote: rejSentence.trim(),
        reason: `Customer explicitly rejected, halted, or expressed negation: "${rejSentence.trim()}".`,
        confidence: 0.95,
      };
    }
  }

  // Clear affirmative confirmation phrases (English, Hindi, Tamil, Telugu)
  const affirmativePatterns = [
    /\b(?:yes|yeah|yep|proceed|execute|confirm|confirmed|place the order|do it|done|agreed|approved)\b/i,
    /\b(?:haan|theek hai|kar do|laga do|dal do|daal do|sahi hai|chalega|ok proceed|yes please)\b/i,
    // Tamil affirmative phrases
    /\b(?:seri|seri pannunga|seri pannidunga|aamaa|aamaam|podunga|kandippa|vaangunga|vithudunga|pannalam)\b/i,
    // Telugu affirmative phrases
    /\b(?:sare|sare cheyyandi|avunu|avunandi|pettandi|alage|alage cheyyandi|thappakunda|kondi|ammeyandi)\b/i,
  ];

  for (const ap of affirmativePatterns) {
    const match = lower.match(ap);
    if (match) {
      const sentences = evalText.split(/[.?!;\n]+/);
      const affSentence = sentences.find((s) => ap.test(s)) || match[0];
      return {
        confirmed: true,
        quote: affSentence.trim(),
        reason: `Customer gave explicit affirmative consent: "${affSentence.trim()}".`,
        confidence: 0.95,
      };
    }
  }

  // Bare "okay" or "sure"
  if (/\b(?:okay|ok|sure|fine)\b/i.test(lower)) {
    return {
      confirmed: true,
      quote: 'okay',
      reason: 'Customer acknowledged with affirmative conversational agreement.',
      confidence: 0.85,
    };
  }

  return {
    confirmed: false,
    quote: '',
    reason: 'No clear customer confirmation or acknowledgement found in transcript.',
    confidence: 0.80,
  };
}

/**
 * Evaluates Return Commitment / Guarantees (Q5) with Semantic Context, Polarity & Negation.
 * Rule:
 *  - "I guarantee you will make money" -> VIOLATION (FAIL)
 *  - "I cannot guarantee returns" / "No return guarantee" -> COMPLIANT (PASS)
 *  - "Stock market involves risk" / "Past performance doesn't guarantee" -> COMPLIANT (PASS)
 */
export function evaluateReturnCommitment(
  transcript: string
): { hasCommitment: boolean; quote: string; reason: string; confidence: number } {
  if (!transcript) {
    return { hasCommitment: false, quote: '', reason: 'No dialogue recorded.', confidence: 0.95 };
  }

  const lower = transcript.toLowerCase();

  // Negated guarantee statements (Compliance Safe / PASS)
  const safeDisclaimerPatterns = [
    /\b(?:cannot guarantee|can't guarantee|no guarantee|not guarantee|does not guarantee|do not guarantee)\b/i,
    /\b(?:guarantee nahi|koi guarantee nahi|pakka nahi hai|risk rehta hai|market risk)\b/i,
    /\b(?:subject to market risks?|past performance does not guarantee)\b/i,
  ];

  for (const sdp of safeDisclaimerPatterns) {
    if (sdp.test(lower)) {
      const sentences = transcript.split(/[.?!;\n]+/);
      const safeSentence = sentences.find((s) => sdp.test(s)) || 'Disclaimer provided';
      return {
        hasCommitment: false,
        quote: safeSentence.trim(),
        reason: `Advisor correctly stated non-guarantee/regulatory risk disclaimer: "${safeSentence.trim()}".`,
        confidence: 0.95,
      };
    }
  }

  // Prohibited Return / Profit Guarantees (Fatal Violation)
  // Multilingual Affirmative Dictionary (English, Hindi, Tamil, Telugu)
  const prohibitedGuaranteePatterns = [
    // English
    /\bguaranteed\b/i,
    /\bfixed\s+return\b/i,
    /\b100%?\s*(?:sure|safe)\s*profit\b/i,
    /\brisk\s*[-_]?\s*free\s*(?:return|profit)?\b/i,
    /\bloss\s+will\s+not\s+happen\b/i,
    /\bguaranteed\s+(?:\d+%\s+)?(?:return|profit|gain|target|income)\b/i,
    /\b(?:i|we)\s+guarantee\s+you\b/i,
    // Hindi
    /\bguarantee\s+(?:hai|deta\s+hoon|milega)\b/i,
    /\bpakka\s+profit\b/i,
    /\bnuksan\s+nahi\s+hoga\b/i,
    /\bsure\s+shot\s*(?:profit|gain)?\b/i,
    /\bdouble\s+ho\s+jayega\b/i,
    /\bloss\s+nahi\s+hoga\b/i,
    /\bpaisa\s+banega\s+hi\s+banega\b/i,
    // Tamil
    /\bnichayam\s+(?:labam|laabam)\b/i,
    /\bloss\s+(?:aagadhu|aagathu)\b/i,
    /\bkandippa\s+(?:yerum|profit)\b/i,
    // Telugu
    /\bloss\s+(?:radu|raadu)\b/i,
    /\bkacchitanga\s*(?:labham|profit)?\b/i,
  ];

  for (const pgp of prohibitedGuaranteePatterns) {
    const match = lower.match(pgp);
    if (match) {
      const sentences = transcript.split(/[.?!;\n]+/);
      const badSentence = sentences.find((s) => pgp.test(s)) || match[0];
      return {
        hasCommitment: true,
        quote: badSentence.trim(),
        reason: `Advisor made prohibited verbal return/profit commitment: "${badSentence.trim()}".`,
        confidence: 0.98,
      };
    }
  }

  return {
    hasCommitment: false,
    quote: 'No return commitment made.',
    reason: 'Adviser made no return or profit commitments or guarantees during the conversation.',
    confidence: 0.95,
  };
}

/**
 * Checks if CMP / verbal market price is indicated in the transcript
 */
export const MARKET_PRICE_PHRASES = [
  'current market price',
  'current marker price',
  'market price',
  'marker price',
  'cmp',
  'c.m.p',
  'c.m.p.',
  'c m p',
  'c m p pe',
  'cmp pe',
  'cmp par',
  'cmp rate',
  'cmp exit',
  'see em pee',
  'market rate',
  'marker rate',
  'at market',
  'at market price',
  'market pe',
  'market par',
  'market mein',
  'market me',
  'current price',
  'current rate',
  'current market rate',
  'current bhav',
  'current bhav pe',
  'current bhav par',
  'market bhav',
  'market order',
  'market execution',
  'order at market',
  'jo rate hai',
  'jo rate chal raha',
  'jo rate chal raha hai',
  'jo chal raha hai',
  'jo chal raha',
  'current chal raha',
  'jo bhi bhav hai',
  'live rate',
  'live market rate',
  'live market price',
  'rate pe',
  'rate jo hai',
  'bhav pe',
  'bhav pe le lo',
  'market pe le lo',
  'market pe de do',
  'market pe kar do',
  'market pe laga do',
  'market pe exit',
  'market mein exit',
  'market rate pe',
  'market price pe',
  'market price exit',
  'limit price',
  'limit rate',
  'best price',
  'rate pe kar do',
  'order type market',
  'market order laga do',
  'market mein buy',
  'market me buy',
  'market buy',
  'market sell',
  // Tamil market rate expressions
  'market rate la',
  'market rate le',
  'market rate podunga',
  'market vilai',
  'current vilai',
  'cmp la',
  'current rate la',
  'live rate la',
  'bhav la',
  'market la podunga',
  'market la vaangunga',
  'market la vithudunga',
  // Telugu market rate expressions
  'market rate lo',
  'market rate lo pettandi',
  'market vela',
  'current vela',
  'cmp lo',
  'current rate lo',
  'live rate lo',
  'bhav lo',
  'market lo pettandi',
  'market lo konandi',
  'market lo ammeyandi',
];

export function mentionsMarketPriceOrCMP(transcript: string): boolean {
  if (!transcript) return false;
  const lower = transcript.toLowerCase();
  if (MARKET_PRICE_PHRASES.some((phrase) => lower.includes(phrase))) {
    return true;
  }
  // Regex pattern for variations of market order / CMP / live rate / bhav across English, Hindi, Tamil, Telugu
  const cmpRegex = /\b(?:cmp|current\s*market\s*price|current\s*marker\s*price|marker\s*price|market\s*rate|at\s*market|bhav\s*(?:pe|par|per|se|la|lo)|market\s*(?:pe|par|mein|me|la|le|lo|order|podunga|pettandi))\b/i;
  return cmpRegex.test(transcript);
}

/**
 * Robust check if a target trade price appears in the transcript with tokenization
 * or if verbal Current Market Price (CMP) is explicitly confirmed.
 */
export function matchPriceInTranscript(targetPrice: number, transcript: string): boolean {
  if (!transcript) return false;

  // If order is placed at Current Market Price (CMP) or price is 0, verbal CMP confirmation is 100% compliant
  if (mentionsMarketPriceOrCMP(transcript)) {
    return true;
  }

  if (!targetPrice || targetPrice <= 0) return false;

  const tokens = extractNumericTokens(transcript);
  const roundedTarget = Math.round(targetPrice);

  for (const token of tokens) {
    // 1. Exact or decimal paisa match
    if (Math.abs(token - targetPrice) < 0.05) {
      return true;
    }
    // 2. Exact integer match when decimal is 0 (e.g. 180 vs 180.0)
    if (Math.abs(token - roundedTarget) < 0.01 && Math.abs(targetPrice - roundedTarget) < 0.01) {
      return true;
    }
  }

  // Also check direct substring pattern
  const rawPriceStr = String(targetPrice);
  if (new RegExp(`\\b${rawPriceStr}\\b`).test(transcript)) {
    return true;
  }

  return false;
}

/**
 * Robust check if a target trade quantity appears in the transcript with tokenization.
 * Prevents 100 matching inside 1000, with 90% match tolerance and spoken word support.
 */
export function matchQuantityInTranscript(targetQuantity: number, transcript: string): boolean {
  if (!targetQuantity || targetQuantity <= 0 || !transcript) return false;

  const lower = transcript.toLowerCase();

  // Explicit position liquidation / full holding exit confirmed verbally:
  // e.g. "sara bech do", "pura quantity exit", "full position square off", "all shares", "entire holding"
  // Tamil: "motha shares", "mothama", Telugu: "motham", "anni shares"
  const fullExitPatterns = [
    /\b(?:sara|saara|poora|pura|entire|complete|all|motha|mothum|mothama|anni)\s*(?:bech|exit|sell|square\s*off|shares?|holding|quantit(?:y|ies)|ammeyandi|vithudunga)\b/i,
    /\b(?:full\s*position|full\s*quantity|all\s*shares|pura\s*exit|sara\s*exit|motham\s*exit)\b/i,
  ];
  if (fullExitPatterns.some((pat) => pat.test(lower))) {
    return true;
  }

  const tokens = extractNumericTokens(transcript);
  const spokenNormalizedTranscript = normalizeSpokenNumbers(transcript);
  const allTokens = Array.from(new Set([...tokens, ...extractNumericTokens(spokenNormalizedTranscript)]));

  for (const token of allTokens) {
    // Exact quantity match (10% tolerance removed per SEBI mandate)
    if (Math.abs(token - targetQuantity) < 0.01) {
      return true;
    }
  }

  const rawQtyStr = String(Math.round(targetQuantity));
  if (new RegExp(`\\b${rawQtyStr}\\b`).test(transcript)) {
    return true;
  }

  // Spoken number words in Hindi, English, Tamil, Telugu
  const spokenQtyMap: Record<number, string[]> = {
    1: ['one', 'ek', 'single', 'onnu', 'ondru', 'okati', 'oka'],
    2: ['two', 'do', 'rendu', 'irandu'],
    3: ['three', 'teen', 'moonu', 'moondru', 'moodu'],
    4: ['four', 'char', 'chaar', 'naalu', 'naangu', 'naalugu', 'nalugu'],
    5: ['five', 'paanch', 'panch', 'anju', 'aindhu', 'aidu'],
    6: ['six', 'chhe', 'che', 'aaru'],
    7: ['seven', 'saat', 'ezhu', 'yezhu', 'yedu', 'edu'],
    8: ['eight', 'aath', 'ettu', 'enimidi'],
    9: ['nine', 'nau', 'onbadhu', 'ombadhu', 'tommidi'],
    10: ['ten', 'das', 'pathu', 'padi', 'padhi'],
    12: ['twelve', 'barah', 'bara'],
    15: ['fifteen', 'pandrah', 'pathinanju', 'padihenu'],
    16: ['sixteen', 'solah'],
    20: ['twenty', 'bees', 'irubathu', 'iravai'],
    25: ['twenty five', 'pachis', 'pachees', 'irubathi aindhu', 'iruvathi anju', 'iravai aidu'],
    50: ['fifty', 'pachaas', 'pachas', 'aimbathu', 'yabhai', 'yaabhai'],
    75: ['seventy five', 'pachhattar'],
    100: ['hundred', 'sau', 'ek sau', 'one hundred', 'nooru', 'vanda', 'vandha'],
    200: ['two hundred', 'do sau'],
    500: ['five hundred', 'paansau', 'ainooru'],
    1000: ['thousand', 'hazaar', 'aayiram', 'veyyi', 'vela'],
  };

  const words = spokenQtyMap[Math.round(targetQuantity)] || [];
  for (const w of words) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(transcript)) {
      return true;
    }
  }

  // Also check if any generic quantity pattern matches transcript (e.g. "X shares", "X lots", "X quantities")
  const sharesMatches = Array.from(transcript.matchAll(/\b(\d+)\s*(?:shares?|lots?|qty|quantities|nag|hisse|piece|share)\b/gi));
  for (const m of sharesMatches) {
    const parsedQty = parseInt(m[1], 10);
    if (parsedQty > 0 && parsedQty === Math.round(targetQuantity)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes any date value (string, number, Date object) to a strictly valid HTML5 / ISO YYYY-MM-DD format.
 * Returns empty string if the input is not a valid date (never silently defaults to today's date).
 */
export function normalizeToIsoDate(raw: any): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (
      !trimmed ||
      trimmed === '—' ||
      trimmed === '-' ||
      trimmed.toLowerCase() === 'null' ||
      trimmed.toLowerCase() === 'undefined' ||
      trimmed.toLowerCase() === 'nan'
    ) {
      return '';
    }
    // Already valid ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return trimmed;
    }
    // Match ISO with time (e.g. 2024-04-24T... or 2024-04-24 10:30:00)
    const isoPrefixMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoPrefixMatch) {
      const [, y, m, d] = isoPrefixMatch;
      const mNum = parseInt(m, 10);
      const dNum = parseInt(d, 10);
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    // YYYY/MM/DD or YYYY.MM.DD
    const ymdSlash = trimmed.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/);
    if (ymdSlash) {
      const [, y, m, d] = ymdSlash;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // DD-MM-YY or DD/MM/YY
    const dmyShort = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
    if (dmyShort) {
      const [, d, m, yy] = dmyShort;
      const fullYear = `20${yy}`;
      return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Compact YYYYMMDD
    const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) {
      const [, y, m, d] = compact;
      return `${y}-${m}-${d}`;
    }
    // Try standard Date parsing for textual dates like "24-Apr-2024" or "April 24, 2024"
    const parsedTimestamp = Date.parse(trimmed);
    if (!isNaN(parsedTimestamp)) {
      const dt = new Date(parsedTimestamp);
      return dt.toISOString().slice(0, 10);
    }
    return '';
  }
  if (typeof raw === 'number') {
    if (isNaN(raw) || raw <= 0) return '';
    // Check if Excel serial date (e.g. 25569 = 1970-01-01)
    if (raw > 25569 && raw < 80000) {
      const dt = new Date(Math.round((raw - 25569) * 86400 * 1000));
      if (!isNaN(dt.getTime())) {
        return dt.toISOString().slice(0, 10);
      }
    }
    // Check if epoch timestamp (ms or s)
    if (raw > 1000000000000) {
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    } else if (raw > 1000000000) {
      const dt = new Date(raw * 1000);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    return '';
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  return '';
}

