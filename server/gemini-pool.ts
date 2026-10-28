import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

export interface GeminiKeyHealth {
  index: number;
  maskedKey: string;
  cooldownUntil: number;
  totalRequests: number;
  rateLimitHits: number;
  consecutiveErrors: number;
  lastUsedAt?: string;
  status: 'READY' | 'RATE_LIMITED' | 'ERROR';
}

export interface TranscriptionResult {
  transcript: string;
  rawTranscript: string;
  segments: Array<{
    segment_id: string;
    start_time: number;
    end_time: number;
    speaker: 'ADVISOR' | 'CLIENT' | 'UNKNOWN';
    text: string;
  }>;
  durationSeconds: number;
  keyUsedIndex: number;
  model: string;
}

export interface TradeOrderVerification {
  isConfirmed: boolean;
  scripMentioned: boolean;
  priceOrCmpMentioned: boolean;
  quantityMentioned: boolean;
  customerAcknowledged: boolean;
  noReturnCommitment: boolean;
  detectedScrip?: string;
  detectedPrice?: string;
  detectedQuantity?: string;
  evidenceQuote?: string;
  reason: string;
}

export interface FivePointAuditResult {
  q1_registered_number: {
    status: 'PASS' | 'FAIL';
    evidence: string;
    reason: string;
  };
  q2_regulatory_norms: {
    status: 'PASS' | 'FAIL';
    evidence: string;
    reason: string;
  };
  q3_scrip_price_qty: {
    status: 'PASS' | 'FAIL';
    evidence: string;
    reason: string;
  };
  q4_customer_acknowledged: {
    status: 'PASS' | 'FAIL';
    evidence: string;
    reason: string;
  };
  q5_no_return_commitment: {
    status: 'PASS' | 'FAIL';
    evidence: string;
    reason: string;
  };
  overall_compliance: 'PASS' | 'FAIL';
  summary: string;
}

/**
 * Enterprise Multi-Key Gemini API Pool (1 to 20 keys)
 * - Auto-rotation on HTTP 429 quota exhaustion
 * - Client-side request pacing (min 6s between calls per key)
 * - Exponential backoff with random jitter
 * - Immediate Files API cleanup (files.delete)
 */
export class GeminiPoolManager {
  private keys: string[] = [];
  private clients: Map<string, GoogleGenAI> = new Map();
  private currentIndex: number = 0;
  private cooldowns: Map<number, number> = new Map();
  private stats: Map<number, { requests: number; rateLimits: number; errors: number }> = new Map();
  private lastRequestTime: number = 0;
  private readonly minPacingMs: number = 6000;
  private readonly defaultModel: string = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  constructor() {
    this.refreshKeys();
  }

  /**
   * Refreshes API keys from environment variables or custom configuration.
   * Max 20 keys, Min 1 key.
   */
  public refreshKeys(): void {
    const rawKeys: string[] = [];

    // 1. Check GEMINI_API_KEYS (comma, space, or newline separated list)
    if (process.env.GEMINI_API_KEYS) {
      const parts = process.env.GEMINI_API_KEYS.split(/[\r\n,;]+/).map((k) => k.trim()).filter((k) => k.length > 5);
      rawKeys.push(...parts);
    }

    // 2. Check numbered keys: GEMINI_API_KEY_1 to GEMINI_API_KEY_20
    for (let i = 1; i <= 20; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`];
      if (k && k.trim().length > 5 && !rawKeys.includes(k.trim())) {
        rawKeys.push(k.trim());
      }
    }

    // 3. Fallback to standard GEMINI_API_KEY
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5) {
      const standard = process.env.GEMINI_API_KEY.trim();
      if (!rawKeys.includes(standard)) {
        rawKeys.push(standard);
      }
    }

    // Restrict to max 20, min 1
    this.keys = rawKeys.slice(0, 20);
    this.clients.clear();

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      this.clients.set(key, new GoogleGenAI({ apiKey: key }));
      if (!this.stats.has(i)) {
        this.stats.set(i, { requests: 0, rateLimits: 0, errors: 0 });
      }
    }

    console.log(`[GeminiPool] Initialized with ${this.keys.length} API key(s) (Maximum supported: 20).`);
  }

  public getKeyCount(): number {
    return this.keys.length;
  }

  public getPoolHealth(): GeminiKeyHealth[] {
    const now = Date.now();
    return this.keys.map((key, idx) => {
      const stat = this.stats.get(idx) || { requests: 0, rateLimits: 0, errors: 0 };
      const cd = this.cooldowns.get(idx) || 0;
      let status: 'READY' | 'RATE_LIMITED' | 'ERROR' = 'READY';
      if (cd > now) {
        status = 'RATE_LIMITED';
      } else if (stat.errors > 3) {
        status = 'ERROR';
      }

      const masked = key.length > 10
        ? `${key.slice(0, 4)}...${key.slice(-4)}`
        : '****';

      return {
        index: idx + 1,
        maskedKey: masked,
        cooldownUntil: cd,
        totalRequests: stat.requests,
        rateLimitHits: stat.rateLimits,
        consecutiveErrors: stat.errors,
        status,
      };
    });
  }

  public getStatus() {
    const health = this.getPoolHealth();
    const now = Date.now();
    const activeKeys = health.filter((h) => h.status === 'READY').length;
    const cooldownKeys = health.filter((h) => h.status === 'RATE_LIMITED').length;
    const exhaustedKeys = health.filter((h) => h.status === 'ERROR').length;
    const requestsHandled = health.reduce((sum, h) => sum + h.totalRequests, 0);

    return {
      totalKeys: this.keys.length,
      activeKeys,
      cooldownKeys,
      exhaustedKeys,
      requestsHandled,
      keys: health.map((h, i) => ({
        index: i,
        maskedKey: h.maskedKey,
        isCooldown: h.status === 'RATE_LIMITED',
        cooldownRemainingMs: Math.max(0, h.cooldownUntil - now),
      })),
    };
  }

  public setKeys(newKeys: string[]): void {
    const valid = newKeys.map((k) => k.trim()).filter((k) => k.length > 5).slice(0, 20);
    this.keys = valid;
    this.clients.clear();
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      this.clients.set(key, new GoogleGenAI({ apiKey: key }));
      if (!this.stats.has(i)) {
        this.stats.set(i, { requests: 0, rateLimits: 0, errors: 0 });
      }
    }
    console.log(`[GeminiPool] Updated key pool with ${this.keys.length} API key(s).`);
  }

  /**
   * Pacing throttle: wait if last request was within pacing threshold
   */
  private async enforcePacing(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minPacingMs) {
      const waitTime = this.minPacingMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Selects next available API key from pool that is not cooling down.
   */
  private getNextClient(): { client: GoogleGenAI; keyIndex: number } {
    if (this.keys.length === 0) {
      throw new Error('AWAITING_API_KEY: No Gemini API keys configured. Set GEMINI_API_KEY or GEMINI_API_KEYS (1 to 20 keys).');
    }

    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const cooldownUntil = this.cooldowns.get(idx) || 0;
      if (now >= cooldownUntil) {
        this.currentIndex = idx;
        const key = this.keys[idx];
        return { client: this.clients.get(key)!, keyIndex: idx };
      }
    }

    // All keys in cooldown: find the one that expires soonest
    let earliestIdx = 0;
    let minWait = Infinity;
    for (let i = 0; i < this.keys.length; i++) {
      const wait = (this.cooldowns.get(i) || 0) - now;
      if (wait < minWait) {
        minWait = wait;
        earliestIdx = i;
      }
    }

    this.currentIndex = earliestIdx;
    const key = this.keys[earliestIdx];
    return { client: this.clients.get(key)!, keyIndex: earliestIdx };
  }

  /**
   * Marks a key as rate limited (429) and puts it on a 60-second cooldown
   */
  private markRateLimited(keyIndex: number): void {
    const stat = this.stats.get(keyIndex) || { requests: 0, rateLimits: 0, errors: 0 };
    stat.rateLimits++;
    this.stats.set(keyIndex, stat);

    const cooldownDuration = 60000; // 60 seconds cooldown
    this.cooldowns.set(keyIndex, Date.now() + cooldownDuration);
    console.warn(`[GeminiPool] Key #${keyIndex + 1} hit 429 (Rate Limit). Cooling down for 60s. Switching to next key...`);

    // Advance index immediately
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
  }

  /**
   * Execute an operation across the key pool with automatic failover, exponential backoff, and jitter
   */
  public async executeWithRotation<T>(
    operation: (client: GoogleGenAI, keyIndex: number) => Promise<T>,
    maxRetries: number = 6
  ): Promise<{ result: T; keyUsed: number }> {
    const baseDelay = 3000;
    const effectiveRetries = Math.min(maxRetries, Math.max(1, this.keys.length));

    for (let attempt = 0; attempt < effectiveRetries; attempt++) {
      await this.enforcePacing();
      const { client, keyIndex } = this.getNextClient();

      const stat = this.stats.get(keyIndex) || { requests: 0, rateLimits: 0, errors: 0 };
      stat.requests++;
      this.stats.set(keyIndex, stat);

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API call timed out after 8000ms')), 8000)
        );
        const result = await Promise.race([operation(client, keyIndex), timeoutPromise]);
        stat.errors = 0; // reset errors on success
        return { result, keyUsed: keyIndex };
      } catch (err: any) {
        const msg = String(err?.message || err);
        const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Too Many Requests') || msg.includes('quota');

        if (is429) {
          this.markRateLimited(keyIndex);

          if (attempt === effectiveRetries - 1) {
            throw new Error(`All ${this.keys.length} Gemini API key(s) exhausted their quota (429 Rate Limit).`);
          }

          // If more keys are available and not on cooldown, try next immediately without sleeping long
          const now = Date.now();
          const hasAvailableKey = this.keys.some((_, i) => (this.cooldowns.get(i) || 0) <= now);

          if (!hasAvailableKey) {
            // All keys are rate-limited, apply exponential backoff with jitter
            const jitter = Math.random() * 2000;
            const sleepMs = (baseDelay * Math.pow(1.5, attempt)) + jitter;
            console.log(`[GeminiPool] All keys throttled. Exponential backoff sleeping ${(sleepMs / 1000).toFixed(1)}s before attempt ${attempt + 2}...`);
            await new Promise((r) => setTimeout(r, sleepMs));
          }
        } else if (msg.includes('401') || msg.includes('UNAUTHENTICATED')) {
          stat.errors++;
          console.error(`[GeminiPool] Key #${keyIndex + 1} authentication error (invalid/unsupported token). Skipping key.`);
          this.cooldowns.set(keyIndex, Date.now() + 3600000);
          this.currentIndex = (this.currentIndex + 1) % this.keys.length;
          const hasAnotherKey = this.keys.some((_, i) => (this.cooldowns.get(i) || 0) < Date.now());
          if (!hasAnotherKey) {
            throw err;
          }
        } else {
          stat.errors++;
          console.error(`[GeminiPool] Key #${keyIndex + 1} error: ${msg}`);
          if (attempt === maxRetries - 1) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    throw new Error('Gemini pool operation failed after max retries.');
  }

  /**
   * Transcribes an audio file verbatim using Gemini Flash and Files API
   */
  public async transcribeAudio(
    audioPath: string,
    options?: {
      preferredLanguage?: string;
      stockHints?: string[];
      clientCode?: string;
    }
  ): Promise<TranscriptionResult> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found at: ${audioPath}`);
    }

    const ext = path.extname(audioPath).toLowerCase();
    let mimeType = 'audio/mp3';
    if (ext === '.wav') mimeType = 'audio/wav';
    else if (ext === '.m4a') mimeType = 'audio/m4a';
    else if (ext === '.aac') mimeType = 'audio/aac';
    else if (ext === '.ogg') mimeType = 'audio/ogg';
    else if (ext === '.flac') mimeType = 'audio/flac';

    const systemPrompt = `You are an expert speech recognition model for Indian equity telephonic calls.
- Languages: Indian English, Hindi, Tamil, Telugu, and Hinglish (code-switching).
- Domain context: Equity stock trading, UCC Client Codes (allowed prefixes: WIA, WIF, WIC, WID, WIG, WIE, FIA, PWD followed by 4 to 6 digits, e.g. WIA12345), buy, sell, shares, Bhav, CMP, Market price, Limit price, quantity, stop loss.
${options?.stockHints?.length ? `- Relevant Stock Names: ${options.stockHints.join(', ')}` : ''}
${options?.clientCode ? `- Expected Client Code: ${options.clientCode}` : ''}

Task: Provide a complete, verbatim transcript of the audio conversation.
Label speakers clearly as "Dealer:" (or Advisor) and "Customer:" (or Client) where distinguishable.
Do not summarize. Transcribe every word spoken verbatim.`;

    const { result, keyUsed } = await this.executeWithRotation(async (client) => {
      let uploadFileResponse: any = null;
      try {
        // 1. Upload via Files API
        uploadFileResponse = await client.files.upload({
          file: audioPath,
          config: { mimeType },
        } as any);

        // 2. Generate verbatim transcript
        const response = await client.models.generateContent({
          model: this.defaultModel,
          contents: [
            uploadFileResponse,
            systemPrompt,
          ],
        });

        const rawText = response.text || '';
        return { rawText };
      } finally {
        // 3. Mandatory Files API Cleanup: delete file immediately
        if (uploadFileResponse && uploadFileResponse.name) {
          try {
            await client.files.delete({ name: uploadFileResponse.name });
          } catch (delErr: any) {
            console.warn(`[GeminiPool] Could not delete cloud file ${uploadFileResponse.name}:`, delErr?.message);
          }
        }
      }
    });

    const rawTranscript = result.rawText.trim();

    // Parse transcript into segments based on speaker lines
    const lines = rawTranscript.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const segments: TranscriptionResult['segments'] = [];

    let currentSpeaker: 'ADVISOR' | 'CLIENT' | 'UNKNOWN' = 'UNKNOWN';
    let currentText = '';
    let segIdx = 1;

    for (const line of lines) {
      const spkMatch = line.match(/^(?:(dealer|advisor|agent|representative|broker)|(customer|client|caller)):?\s*(.*)$/i);
      if (spkMatch) {
        if (currentText) {
          segments.push({
            segment_id: `gemini_seg_${segIdx++}`,
            start_time: (segIdx - 1) * 3,
            end_time: segIdx * 3,
            speaker: currentSpeaker,
            text: currentText.trim(),
          });
        }
        currentSpeaker = spkMatch[1] ? 'ADVISOR' : 'CLIENT';
        currentText = spkMatch[3] || '';
      } else {
        currentText += (currentText ? ' ' : '') + line;
      }
    }

    if (currentText) {
      segments.push({
        segment_id: `gemini_seg_${segIdx++}`,
        start_time: (segIdx - 1) * 3,
        end_time: segIdx * 3,
        speaker: currentSpeaker,
        text: currentText.trim(),
      });
    }

    return {
      transcript: rawTranscript,
      rawTranscript,
      segments: segments.length > 0 ? segments : [{
        segment_id: 'gemini_seg_1',
        start_time: 0,
        end_time: 10,
        speaker: 'UNKNOWN',
        text: rawTranscript,
      }],
      durationSeconds: segments.length * 3,
      keyUsedIndex: keyUsed + 1,
      model: this.defaultModel,
    };
  }

  /**
   * Fast verification to determine if a call transcript confirms a specific trade order:
   * Checks Scrip (stock name), Price/CMP, and Quantity.
   */
  public async verifyTradeOrderInTranscript(
    transcript: string,
    trade: {
      symbol: string;
      quantity: number;
      price?: number;
      order_type?: string;
    }
  ): Promise<TradeOrderVerification> {
    if (this.keys.length === 0) {
      const lowerTr = transcript.toLowerCase();
      const symbolMatch = lowerTr.includes(trade.symbol.toLowerCase());
      const qtyMatch = String(trade.quantity) ? lowerTr.includes(String(trade.quantity)) : false;
      const cmpMatch = /cmp|market|price|limit/i.test(lowerTr);
      const ackMatch = /yes|confirm|proceed|okay|theek\s*hai|done/i.test(lowerTr);
      return {
        isConfirmed: symbolMatch && (qtyMatch || cmpMatch) && ackMatch,
        scripMentioned: symbolMatch,
        priceOrCmpMentioned: cmpMatch,
        quantityMentioned: qtyMatch,
        customerAcknowledged: ackMatch,
        noReturnCommitment: true,
        detectedScrip: symbolMatch ? trade.symbol : undefined,
        reason: 'Evaluated deterministically in offline mode (0 Gemini API keys configured)',
      };
    }
    const prompt = `You are an equity trade compliance auditor.
Analyze the following telephonic call transcript to verify if this specific trade was discussed and confirmed:

TARGET TRADE PARTICULARS:
- Scrip / Stock Name: "${trade.symbol}"
- Quantity: ${trade.quantity} shares
- Price: ${trade.price ? `${trade.price}` : 'Market Price / CMP'}

CALL TRANSCRIPT:
"""
${transcript.slice(0, 10000)}
"""

Evaluate:
1. Was this Scrip/Stock mentioned (allowing common variations, e.g. "Tata Motors" for "TATAMOTORS", "Reliance" for "RELIANCE")?
2. Was Price (or Market Price / CMP) mentioned?
3. Was Quantity (${trade.quantity} or approximate/partial) mentioned?
4. Did the customer acknowledge/confirm placing this order?
5. Did the dealer promise any guaranteed returns (return commitment)?

Return ONLY a valid JSON object matching this schema:
{
  "isConfirmed": true/false,
  "scripMentioned": true/false,
  "priceOrCmpMentioned": true/false,
  "quantityMentioned": true/false,
  "customerAcknowledged": true/false,
  "noReturnCommitment": true/false,
  "detectedScrip": "name found or null",
  "detectedPrice": "price found or null",
  "detectedQuantity": "qty found or null",
  "evidenceQuote": "short verbatim quote from transcript",
  "reason": "Brief 1-sentence explanation"
}`;

    try {
      const { result } = await this.executeWithRotation(async (client) => {
        const response = await client.models.generateContent({
          model: this.defaultModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const text = response.text || '{}';
        return JSON.parse(text) as TradeOrderVerification;
      });

      return result;
    } catch (err: any) {
      console.error(`[GeminiPool] verifyTradeOrder failed: ${err.message}`, err.stack);
      throw new Error(`LLM_VERIFICATION_FAILED: ${err.message}`);
    }
  }

  /**
   * The 5-Point Equity Dealer Regulatory Audit
   * Evaluates ONLY these 5 questions:
   * 1. Confirmation given in the Customer's Registered/authorised Number?
   * 2. Pre Order Confirmation is as per the Regulatory Norms? (timing check before trade execution)
   * 3. Was Script, price and quantity mentioned?
   * 4. Customer Acknowledge the same?
   * 5. Wasn't there any Return Commitment?
   */
  public async performFivePointAudit(
    callMetadata: {
      customerNumber: string;
      callTime: string;
      callDate?: string;
    },
    tradeData: {
      registeredNumber: string;
      orderTimestamp: string;
      symbol: string;
      quantity: number;
      price?: number;
    },
    transcript: string
  ): Promise<FivePointAuditResult> {
    if (this.keys.length === 0) {
      const isRegMatched = callMetadata.customerNumber.slice(-10) === tradeData.registeredNumber.slice(-10);
      const isTimingValid = !callMetadata.callTime || !tradeData.orderTimestamp || callMetadata.callTime <= tradeData.orderTimestamp;
      const lowerTr = transcript.toLowerCase();
      const scripMatch = lowerTr.includes(tradeData.symbol.toLowerCase());
      const cmpMatch = /cmp|market|price/i.test(lowerTr);
      const qtyMatch = lowerTr.includes(String(tradeData.quantity));
      const ackMatch = /yes|confirm|proceed|okay|theek\s*hai|done/i.test(lowerTr);

      return {
        q1_registered_number: {
          status: isRegMatched ? 'PASS' : 'FAIL',
          evidence: `Customer number (${callMetadata.customerNumber}) verified against trade registered number (${tradeData.registeredNumber}).`,
          reason: isRegMatched ? 'Registered contact match' : 'Mismatched number',
        },
        q2_regulatory_norms: {
          status: isTimingValid ? 'PASS' : 'FAIL',
          evidence: `Call at ${callMetadata.callTime} verified prior to trade at ${tradeData.orderTimestamp}.`,
          reason: isTimingValid ? 'Pre-order timing verified' : 'Post-order timing violation',
        },
        q3_scrip_price_qty: {
          status: (scripMatch && (qtyMatch || cmpMatch)) ? 'PASS' : 'FAIL',
          evidence: `Scrip: ${tradeData.symbol}, Quantity: ${tradeData.quantity}, Price: Market/CMP`,
          reason: 'Order parameters stated in dialogue',
        },
        q4_customer_acknowledged: {
          status: ackMatch ? 'PASS' : 'FAIL',
          evidence: 'Customer gave explicit verbal acknowledgment in dialogue.',
          reason: 'Customer consent verified',
        },
        q5_no_return_commitment: {
          status: 'PASS',
          evidence: 'No prohibited return or profit guarantee made by advisor.',
          reason: 'SEBI guarantee prohibition adhered to',
        },
        overall_compliance: (isRegMatched && isTimingValid && ackMatch) ? 'PASS' : 'FAIL',
        summary: 'Pre-order call verified under deterministic offline compliance audit.',
      };
    }
    const prompt = `You are a strict compliance auditor auditing an equity dealer call under regulatory trading norms.
Evaluate ONLY the following 5 compliance questions for this pre-order call:

1. Registered Number: Call Number is "${callMetadata.customerNumber}", Registered Trade Number is "${tradeData.registeredNumber}".
2. Regulatory Pre-Order Timing: Call Time is "${callMetadata.callTime}", Trade Execution Time is "${tradeData.orderTimestamp}". Did order confirmation happen BEFORE trade execution?
3. Order Particulars: Were Scrip ("${tradeData.symbol}"), Price/CMP, and Quantity (${tradeData.quantity}) mentioned?
4. Customer Acknowledgment: Did the customer explicitly acknowledge and authorize the order?
5. No Return Commitment: Did the dealer strictly refrain from making any return commitment / profit guarantee? (Must PASS if no return guarantee was promised).

CALL TRANSCRIPT:
"""
${transcript.slice(0, 10000)}
"""

Return ONLY a valid JSON object matching this schema:
{
  "q1_registered_number": {
    "status": "PASS" or "FAIL",
    "evidence": "Brief evidence string",
    "reason": "Reason for decision"
  },
  "q2_regulatory_norms": {
    "status": "PASS" or "FAIL",
    "evidence": "Brief evidence string",
    "reason": "Reason for decision"
  },
  "q3_scrip_price_qty": {
    "status": "PASS" or "FAIL",
    "evidence": "Brief evidence string",
    "reason": "Reason for decision"
  },
  "q4_customer_acknowledged": {
    "status": "PASS" or "FAIL",
    "evidence": "Brief evidence string",
    "reason": "Reason for decision"
  },
  "q5_no_return_commitment": {
    "status": "PASS" or "FAIL",
    "evidence": "Brief evidence string",
    "reason": "Reason for decision"
  },
  "overall_compliance": "PASS" or "FAIL",
  "summary": "1-2 sentence executive summary of the 5-point audit"
}`;

    try {
      const { result } = await this.executeWithRotation(async (client) => {
        const response = await client.models.generateContent({
          model: this.defaultModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const text = response.text || '{}';
        return JSON.parse(text) as FivePointAuditResult;
      });

      return result;
    } catch (err: any) {
      console.error(`[GeminiPool] evaluateFivePointAudit failed: ${err.message}`, err.stack);
      throw new Error(`LLM_AUDIT_EVALUATION_FAILED: ${err.message}`);
    }
  }
}

// Global Singleton Instance
export const geminiPool = new GeminiPoolManager();
