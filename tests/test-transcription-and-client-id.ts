// ============================================================================
// ADAM — Transcription and Client ID Handling Verification Suite
// Tests all 12 cases specified in user prompt
// ============================================================================

import {
  formatCleanClientCode,
  isStrictValidClientCode,
  normalizeClientCode,
  SYMBOL_ALIASES,
  matchSymbolInTranscript,
} from '../server/normalizer';
import {
  extractSpokenEvidence,
  extractStructuredOrders,
  extractAdvisorFromTranscript,
  extractOrderStatements,
  extractStructuredCallInformation,
} from '../server/evidence-extractor';
import { extractSpokenUccCandidates, resolveUccWithAuthoritativeData } from '../server/pipeline/uccResolver';
import { preprocessAudioForTranscription } from '../server/audio-preprocessor';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runSuite() {
  console.log('===============================================================');
  console.log('ADAM TRANSCRIPTION AND CLIENT ID FIX — 12 CORE TEST CASES');
  console.log('===============================================================\n');

  // Case 1: Spoken "Client ID is WIA63726"
  {
    const text = 'Client ID is WIA63726, please execute the trade.';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.clientId === 'WIA63726', 'Case 1: Spoken "Client ID is WIA63726"', `Got ${extracted.clientId}`);
  }

  // Case 2: Spoken "Client code W I A 6 3 7 2 6"
  {
    const text = 'Good morning, my client code W I A 6 3 7 2 6 here.';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.clientId === 'WIA63726', 'Case 2: Spoken "Client code W I A 6 3 7 2 6"', `Got ${extracted.clientId}`);
  }

  // Case 3: Spoken "Double U I A six three seven two six"
  {
    const text = 'Account Double U I A six three seven two six please.';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.clientId === 'WIA63726', 'Case 3: Spoken "Double U I A six three seven two six"', `Got ${extracted.clientId}`);
  }

  // Case 4: Spoken "Client code VIA63726" (phonetic confusion VIA -> WIA)
  {
    const text = 'Client code VIA63726';
    const cand = extractSpokenUccCandidates(text);
    const cleaned = formatCleanClientCode(cand[0]?.cleanCandidate || 'VIA63726');
    assert(cleaned === 'WIA63726', 'Case 4: Spoken "Client code VIA63726" resolves to WIA63726', `Got ${cleaned}`);
  }

  // Case 5: Spoken "Buy 100 shares of Reliance at market" (no client ID mentioned)
  {
    const text = 'Buy 100 shares of Reliance at market';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.clientId === null, 'Case 5: No client ID in transcript remains null/UNVERIFIED', `Got ${extracted.clientId}`);
    assert(extracted.stock === 'RELIANCE', 'Case 5: Stock resolved to RELIANCE', `Got ${extracted.stock}`);
    assert(extracted.side === 'BUY', 'Case 5: Side is BUY', `Got ${extracted.side}`);
    assert(extracted.quantity === 100, 'Case 5: Quantity is 100', `Got ${extracted.quantity}`);
    assert(extracted.price === 'CMP', 'Case 5: Price is CMP', `Got ${extracted.price}`);
  }

  // Case 6: Spoken "Okay"
  {
    const text = 'Okay';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.clientId === null, 'Case 6: Brief response "Okay" yields null client ID', `Got ${extracted.clientId}`);
  }

  // Case 7: Customer phone number "889725080" must NEVER be used as Client ID
  {
    const phoneInput = '889725080';
    const isClientCode = isStrictValidClientCode(phoneInput);
    const norm = normalizeClientCode(phoneInput);
    const clean = formatCleanClientCode(phoneInput);
    assert(!isClientCode, 'Case 7: Numeric phone number rejected as Client ID', `isStrictValidClientCode returned ${isClientCode}`);
    assert(norm === '', 'Case 7: normalizeClientCode returns empty string for phone', `Got ${norm}`);
    assert(clean === '', 'Case 7: formatCleanClientCode returns empty string for phone', `Got ${clean}`);

    const extracted = extractStructuredCallInformation('Yes, I want to trade', [], undefined, phoneInput);
    assert(extracted.customerPhone === phoneInput, 'Case 7: Phone number preserved in customerPhone field', `Got ${extracted.customerPhone}`);
    assert(extracted.clientId === null, 'Case 7: Client ID remains null even when phone number is provided', `Got ${extracted.clientId}`);
  }

  // Case 8: "Buying 100 TCS at 3500"
  {
    const text = 'Buying 100 TCS at 3500';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.side === 'BUY', 'Case 8: Side extracted as BUY', `Got ${extracted.side}`);
    assert(extracted.stock === 'TCS', 'Case 8: Symbol extracted as TCS', `Got ${extracted.stock}`);
    assert(extracted.quantity === 100, 'Case 8: Quantity extracted as 100', `Got ${extracted.quantity}`);
    assert(extracted.price === 3500, 'Case 8: Price extracted as 3500', `Got ${extracted.price}`);
  }

  // Case 9: "Buy 50 Infosys at market price"
  {
    const text = 'Buy 50 Infosys at market price';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.side === 'BUY', 'Case 9: Side extracted as BUY', `Got ${extracted.side}`);
    assert(extracted.stock === 'INFY', 'Case 9: Symbol Infosys normalized to INFY', `Got ${extracted.stock}`);
    assert(extracted.quantity === 50, 'Case 9: Quantity extracted as 50', `Got ${extracted.quantity}`);
    assert(extracted.price === 'CMP', 'Case 9: Price type is CMP', `Got ${extracted.price}`);
  }

  // Case 10: Audio Preprocessing conservative WAV handling & graceful fallback
  {
    // Test with non-existent / dummy file to ensure graceful fallback without crashing
    const dummyPath = '/tmp/non_existent_audio_test.wav';
    try {
      const result = await preprocessAudioForTranscription(dummyPath);
      assert(result.normalizedPath === dummyPath, 'Case 10: Preprocessor falls back gracefully to original path if file is missing or ffmpeg fails');
    } catch (err: any) {
      assert(false, 'Case 10: Preprocessor should not throw an unhandled exception', err.message);
    }
  }

  // Case 11: Speaker separation / Advisor extraction
  {
    const text = 'Advisor: Hello this is Rajesh. Client: Yes, please buy 100 Tata Steel.';
    const advisor = extractAdvisorFromTranscript(text);
    assert(advisor === 'Rajesh', 'Case 11: Advisor extracted as Rajesh', `Got ${advisor}`);
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.advisor === 'Rajesh', 'Case 11: Structured call info includes advisor Rajesh', `Got ${extracted.advisor}`);
    assert(extracted.side === 'BUY', 'Case 11: Side is BUY', `Got ${extracted.side}`);
    assert(extracted.quantity === 100, 'Case 11: Quantity is 100', `Got ${extracted.quantity}`);
    assert(extracted.stock === 'TATASTEEL', 'Case 11: Stock resolved to TATASTEEL', `Got ${extracted.stock}`);
  }

  // Case 12: Symbol spelling tolerance: "Buy 100 shares of Relience" -> RELIANCE
  {
    const text = 'Buy 100 shares of Relience';
    const extracted = extractStructuredCallInformation(text);
    assert(extracted.stock === 'RELIANCE', 'Case 12: Relience resolved to RELIANCE', `Got ${extracted.stock}`);
    assert(extracted.quantity === 100, 'Case 12: Quantity is 100', `Got ${extracted.quantity}`);
    assert(extracted.side === 'BUY', 'Case 12: Side is BUY', `Got ${extracted.side}`);
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('---------------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
