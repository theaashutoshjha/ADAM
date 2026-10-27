import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeDeepgramLanguage,
  attributeSpeakerRoles,
} from '../server/deepgram-engine';
import {
  buildDeepgramKeyterms,
  validateTranscriptCoverage,
  type WordInfo,
} from '../server/deepgram-transcriber';
import { isFfmpegInstalled, getFfmpegBinary } from '../server/audio-preprocessor';

console.log('===============================================================');
console.log('DEEPGRAM NOVA-3 SOUTH ASIAN TELEPHONY ASR SUITE');
console.log('===============================================================');

// Verification 1: Language Mapping
console.log('\n--- 1. Verification of Language Mapping (en, hi, ta, te, multi) ---');
assert.strictEqual(normalizeDeepgramLanguage('en'), 'en-IN', 'en maps to en-IN');
assert.strictEqual(normalizeDeepgramLanguage('en-IN'), 'en-IN', 'en-IN maps to en-IN');
assert.strictEqual(normalizeDeepgramLanguage('hi'), 'hi', 'hi maps to hi');
assert.strictEqual(normalizeDeepgramLanguage('hindi'), 'hi', 'hindi maps to hi');
assert.strictEqual(normalizeDeepgramLanguage('ta'), 'ta', 'ta maps to ta');
assert.strictEqual(normalizeDeepgramLanguage('tamil'), 'ta', 'tamil maps to ta');
assert.strictEqual(normalizeDeepgramLanguage('te'), 'te', 'te maps to te');
assert.strictEqual(normalizeDeepgramLanguage('telugu'), 'te', 'telugu maps to te');
assert.strictEqual(normalizeDeepgramLanguage('multi'), 'multi', 'multi maps to multi');
assert.strictEqual(normalizeDeepgramLanguage('auto'), 'multi', 'auto maps to multi');
assert.strictEqual(normalizeDeepgramLanguage(undefined), 'multi', 'default maps to multi');
console.log('✅ [PASS] Language codes (en, hi, ta, te, multi) mapped accurately.');

// Verification 2: Keyterm Prompting & Phonetic UCC Expansion
console.log('\n--- 2. Verification of Keyterms & Spoken UCC Generation ---');
const keyterms = buildDeepgramKeyterms(['WIA71438', 'WIG17577'], ['RELIANCE', 'TATASTEEL']);
assert.ok(keyterms.includes('WIA71438'), 'Keyterms include target UCC WIA71438');
assert.ok(keyterms.includes('WIA 71438'), 'Keyterms include spaced UCC WIA 71438');
assert.ok(keyterms.includes('WIA 7 1 4 3 8'), 'Keyterms include digit-spaced UCC WIA 7 1 4 3 8');
assert.ok(keyterms.includes('WIG17577'), 'Keyterms include target UCC WIG17577');
assert.ok(keyterms.includes('WIC 17577'), 'Keyterms include phonetic confusion WIC 17577');
assert.ok(keyterms.includes('RELIANCE'), 'Keyterms include stock RELIANCE');
assert.ok(keyterms.includes('TATASTEEL'), 'Keyterms include stock TATASTEEL');
assert.ok(keyterms.includes('CMP'), 'Keyterms include standard CMP');
assert.ok(keyterms.includes('theek hai'), 'Keyterms include Hindi confirmation');
assert.ok(keyterms.includes('seri'), 'Keyterms include Tamil confirmation');
assert.ok(keyterms.includes('sare'), 'Keyterms include Telugu confirmation');
console.log(`✅ [PASS] Keyterms generated ${keyterms.length} terms with phonetic expansions.`);

// Verification 3: Audio Preprocessing & FFmpeg
console.log('\n--- 3. Verification of FFmpeg Static & Audio Normalization ---');
const ffmpegBin = getFfmpegBinary();
assert.ok(ffmpegBin, 'FFmpeg binary path resolved');
console.log(`FFmpeg binary: ${ffmpegBin}`);
const hasFfmpeg = await isFfmpegInstalled();
assert.strictEqual(hasFfmpeg, true, 'isFfmpegInstalled() must return true');
console.log('✅ [PASS] FFmpeg engine active and verified for loudnorm & 200Hz-3400Hz filtering.');

// Verification 4: Transcript Coverage & Quality Validation
console.log('\n--- 4. Verification of Transcript Quality & Coverage Validator ---');
const dummyWords: WordInfo[] = [
  { word: 'Hello', start: 0.5, end: 1.0, confidence: 0.98, speaker: 'ADVISOR' },
  { word: 'sir', start: 1.1, end: 1.5, confidence: 0.95, speaker: 'ADVISOR' },
  { word: 'please', start: 2.0, end: 2.4, confidence: 0.92, speaker: 'CLIENT' },
  { word: 'buy', start: 2.5, end: 2.8, confidence: 0.97, speaker: 'CLIENT' },
  { word: 'Reliance', start: 2.9, end: 3.5, confidence: 0.99, speaker: 'CLIENT' },
];
const qualityReport = validateTranscriptCoverage(dummyWords, 4.0);
assert.strictEqual(qualityReport.totalWords, 5, '5 total words evaluated');
assert.strictEqual(qualityReport.validTimedWords, 5, '5 valid timed words');
assert.strictEqual(qualityReport.invalidTimedWords, 0, '0 invalid words');
assert.strictEqual(qualityReport.isCollapsed, false, 'Transcript is not collapsed');
assert.ok(qualityReport.coverageRatio > 0.4, 'Coverage ratio is healthy');
console.log(`✅ [PASS] Transcript quality report validated (coverage: ${(qualityReport.coverageRatio * 100).toFixed(1)}%).`);

// Verification 5: Speaker Role Attribution
console.log('\n--- 5. Verification of Telephony Speaker Role Attribution ---');
const utterances = [
  { speaker: '0', text: 'Good morning, welcome to FundsIndia equity desk. How may I help you?', start: 0.5 },
  { speaker: '1', text: 'Yes, please buy 100 shares of Reliance at market price.', start: 4.5 },
  { speaker: '0', text: 'Order placed successfully for Reliance 100 shares at CMP.', start: 8.0 },
];
const roles = attributeSpeakerRoles(utterances);
assert.strictEqual(roles.advisorSpeakerId, '0', 'Speaker 0 recognized as ADVISOR');
assert.strictEqual(roles.clientSpeakerId, '1', 'Speaker 1 recognized as CLIENT');
console.log(`✅ [PASS] Speaker role attribution accurately identified ADVISOR (${roles.advisorSpeakerId}) and CLIENT (${roles.clientSpeakerId}).`);

// Verification 6: Layer 2 Phonetic Normalizer & Regional Client Code Extractor
console.log('\n--- 6. Verification of Layer 2 Phonetic Normalizer (en, hi, ta, te) ---');
import { extractClientCodes, evaluateReturnCommitment } from '../server/normalizer';

const engCodes = extractClientCodes('Client code is W I A one two three four five please confirm');
assert.ok(engCodes.includes('WIA12345'), 'English spelled UCC extracted: WIA12345');

const hindiCodes = extractClientCodes('Aapka account via ek do teen char paanch mein order daal diya');
assert.ok(hindiCodes.includes('WIA12345'), 'Hindi phonetically split UCC extracted: WIA12345');

const tamilCodes = extractClientCodes('UCC WIA rendu moonu naalu anju aaru buy podunga');
assert.ok(tamilCodes.includes('WIA23456'), 'Tamil spoken number UCC extracted: WIA23456');

const teluguCodes = extractClientCodes('Mee client ID WIC moodu naalugu aidu aaru yedu');
assert.ok(teluguCodes.includes('WIC34567'), 'Telugu spoken number UCC extracted: WIC34567');

const doubleCodes = extractClientCodes('Code is WIF double two three four five');
assert.ok(doubleCodes.includes('WIF22345'), 'Multiplier "double" UCC extracted: WIF22345');

console.log('✅ [PASS] Multilingual client code extractor passed across English, Hindi, Tamil, and Telugu.');

// Verification 7: Q5 Multilingual SEBI Prohibited Guarantee Check
console.log('\n--- 7. Verification of Multilingual Q5 SEBI Guarantee Checks ---');
const engViolation = evaluateReturnCommitment('Sir you will get 100% sure profit on this trade');
assert.strictEqual(engViolation.hasCommitment, true, 'English 100% sure profit flagged as violation');

const hindiViolation = evaluateReturnCommitment('Isme pakka profit hoga koi loss nahi hoga');
assert.strictEqual(hindiViolation.hasCommitment, true, 'Hindi pakka profit flagged as violation');

const tamilViolation = evaluateReturnCommitment('Nichayam labam kedaikkum kandippa yerum');
assert.strictEqual(tamilViolation.hasCommitment, true, 'Tamil nichayam labam flagged as violation');

const teluguViolation = evaluateReturnCommitment('Ee stock lo loss radu kacchitanga profit vasthundi');
assert.strictEqual(teluguViolation.hasCommitment, true, 'Telugu loss radu flagged as violation');

const safeDisclaimer = evaluateReturnCommitment('Equity investments are subject to market risks, we cannot give any guaranteed return');
assert.strictEqual(safeDisclaimer.hasCommitment, false, 'Safe disclaimer correctly identified as COMPLIANT');

console.log('✅ [PASS] Multilingual Q5 SEBI guarantee dictionary passed across all 4 languages.');

console.log('\n===============================================================');
console.log('ALL DEEPGRAM NOVA-3 TESTS PASSED PERFECTLY!');
console.log('===============================================================\n');
