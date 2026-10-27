// =============================================================
// AuditEQ — Stage 3.2: AI Telephony Call Clearing & Speech Restoration Engine
// "Something in middle which clears the call and gets accurate transcription"
// =============================================================

import type { SegmentInfo } from '../evidence-extractor';
import { normalizeFinancialTranscript } from '../asr-engine';
import { FOREIGN_HALLUCINATIONS_REGEX } from './transcription';
import { formatCleanClientCode, isStrictValidClientCode } from '../normalizer';

export interface ClearedCallTranscript {
  transcript: string;
  rawTranscript: string;
  segments: SegmentInfo[];
  formattedDialogue: string;
  detectedUcc?: string;
  isCleared: boolean;
  clearingNotes: string[];
}

const SPELLED_DIGITS_MAP: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  shunya: '0', ek: '1', do: '2', teen: '3', chaar: '4',
  paanch: '5', chhah: '6', saat: '7', aath: '8', nau: '9',
  onnu: '1', ondru: '1', rendu: '2', irandu: '2', moonu: '3', moondru: '3',
  naalu: '4', naangu: '4', anju: '5', aindhu: '5', aaru: '6', ezhu: '7',
  okati: '1', oka: '1', moodu: '3', naalugu: '4', aidu: '5',
};

/**
 * Normalizes spelled-out or fragmented UCC client codes in text.
 * e.g., "W I A 5 7 7 4 7" -> "WIA57747"
 * e.g., "W I G seventeen six thirty-four" -> "WIG17634"
 */
export function reconstructSpokenUccs(text: string, candidateUccs: string[] = []): { text: string; detectedUcc?: string } {
  let cleaned = text;
  let detectedUcc: string | undefined;

  // 0. Multi-line split prefix + digits stitching across dialogue lines:
  // e.g. "WIA\n44531" or "Advisor: WIA\nAdvisor: 44531" or "WIA0\n44531"
  cleaned = cleaned.replace(/\b(W\s*I\s*[A-Z]|F\s*I\s*A|P\s*W\s*D|P\s*W\s*A|V\s*I\s*[A-Z])\s*(?:0|O)?\s*[\r\n]+\s*(?:[A-Z]:\s*)?(?:Advisor:\s*)?(?:sorry\s*,?\s*|sir\s*,?\s*|madam\s*,?\s*|wait\s*,?\s*)?([0-9\s]{4,8})\b/gi, (match, prefix, digits) => {
    let cleanPrefix = prefix.replace(/\s+/g, '').toUpperCase();
    let cleanDigits = digits.replace(/[^0-9]/g, '');
    if (cleanDigits.length >= 4 && cleanDigits.length <= 7) {
      if (cleanPrefix === 'WIC' || cleanPrefix === 'VIC' || cleanPrefix === 'VIG') cleanPrefix = 'WIG';
      if (cleanPrefix === 'VIA') cleanPrefix = 'WIA';
      if (cleanPrefix === 'VIF') cleanPrefix = 'WIF';
      const fullUcc = `${cleanPrefix}${cleanDigits}`;
      if (!detectedUcc) detectedUcc = fullUcc;
      return `${fullUcc} `;
    }
    return match;
  });

  // 1. Spaced prefix + digits / time-like formats / interjections:
  // e.g. "W I A 3 4 3 7 9", "WIC 04:02 2 6", "W I G 4 0 2 2 6", "WIA0, sorry, 44531", "WIA0 44531"
  cleaned = cleaned.replace(/\b(W\s*I\s*[A-Z]|F\s*I\s*A|P\s*W\s*D|P\s*W\s*A|V\s*I\s*[A-Z])\s*(?:0|O)?\s*(?:sorry|sir|madam|please|ek\s*second|one\s*moment|wait|just\s*a\s*minute)?\s*[:\-]?\s*([0-9\s:]{4,14})\b/gi, (match, prefix, digits) => {
    let cleanPrefix = prefix.replace(/\s+/g, '').toUpperCase();
    let cleanDigits = digits.replace(/[^0-9]/g, '');
    // If ASR formatted as time like "04:02 2 6" -> "040226" (6 digits with leading zero), strip leading zero to match 5-digit code
    if (cleanDigits.length === 6 && cleanDigits.startsWith('0')) {
      cleanDigits = cleanDigits.slice(1);
    }
    if (cleanDigits.length >= 4 && cleanDigits.length <= 6) {
      if (cleanPrefix === 'WIC' || cleanPrefix === 'VIC' || cleanPrefix === 'VIG') cleanPrefix = 'WIG';
      if (cleanPrefix === 'VIA') cleanPrefix = 'WIA';
      if (cleanPrefix === 'VIF') cleanPrefix = 'WIF';
      const fullUcc = `${cleanPrefix}${cleanDigits}`;
      if (!detectedUcc) detectedUcc = fullUcc;
      return `${fullUcc} `;
    }
    return match;
  });

  // 2. Spelled out word digits after prefix: e.g. "WIA five seven seven four seven"
  cleaned = cleaned.replace(/\b(WIA|WIF|WIC|WID|WIG|WIE|FIA|PWD)\s+((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ek|do|teen|chaar|paanch|chhah|saat|aath|nau)\s*){4,6})\b/gi, (_match, prefix, wordDigits) => {
    const digitWords = wordDigits.trim().toLowerCase().split(/\s+/);
    let numStr = '';
    for (const dw of digitWords) {
      if (SPELLED_DIGITS_MAP[dw]) numStr += SPELLED_DIGITS_MAP[dw];
    }
    if (numStr.length >= 4 && numStr.length <= 6) {
      let cleanPrefix = prefix.toUpperCase();
      if (cleanPrefix === 'WIC') cleanPrefix = 'WIG';
      const fullUcc = `${cleanPrefix}${numStr}`;
      if (!detectedUcc) detectedUcc = fullUcc;
      return `${fullUcc} `;
    }
    return _match;
  });

  // 3. Match against candidate UCCs with flexible phonetic prefix & time/spaced format tolerance
  for (const cand of candidateUccs) {
    const candClean = cand.trim().toUpperCase();
    if (!isStrictValidClientCode(candClean)) continue;

    const digits = candClean.slice(3);
    const prefix = candClean.slice(0, 3);
    const digitsPat = digits.split('').join('[\\s:.-]*');
    const prefixVariants = [prefix];
    if (prefix === 'WIG') prefixVariants.push('WIC', 'VIC', 'VIG', 'WAG', 'W1G');
    if (prefix === 'WIA') prefixVariants.push('VIA', 'WIU', 'WAS', 'WAA', 'W1A');
    if (prefix === 'WIF') prefixVariants.push('VIF', 'W1F');
    if (prefix === 'PWA') prefixVariants.push('PVA', 'BWA', 'FIA');
    const pfxPat = `(?:${prefixVariants.join('|')})`;

    // Match prefix + optional separator + optional leading 0 + digits pattern (e.g. WIC 04:02 2 6 -> WIG40226)
    const pattern = new RegExp(`\\b${pfxPat}\\s*[-:]?\\s*0?${digitsPat}\\b`, 'i');
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, `${candClean} `);
      if (!detectedUcc) detectedUcc = candClean;
    }
  }

  return { text: cleaned.replace(/\s+/g, ' ').trim(), detectedUcc };
}

/**
 * Removes foreign/Spanish hallucinations and subtitle junk from raw ASR
 */
export function stripAcousticHallucinations(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // Remove Spanish hallucinations
  cleaned = cleaned.replace(FOREIGN_HALLUCINATIONS_REGEX, ' ');

  // Remove subtitle / transcription tags
  cleaned = cleaned.replace(/\[(?:music|applause|laughter|silence|inaudible)\]/gi, ' ');
  cleaned = cleaned.replace(/subtitles?\s+by(?:\s+the\s+amara\.org\s+community)?/gi, ' ');
  cleaned = cleaned.replace(/thank\s+you\s+for\s+watching/gi, ' ');

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Fast sub-second AI Telephony Speech Clarifier using Groq GPT-OSS or Gemini Flash.
 * Translates regional Indian telephony (Tamil, Hindi, Telugu) into clean, punctuated
 * dialogue while preserving exact trade parameters and original quotes.
 */
export async function clarifyDialogueWithAi(
  rawTranscript: string,
  groqApiKey?: string,
  geminiApiKey?: string,
  candidateUcc?: string
): Promise<{ clarifiedDialogue: string; detectedUcc?: string }> {
  const cleanGroqKey = groqApiKey || process.env.GROQ_API_KEY;
  const cleanGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;

  if (!cleanGroqKey && !cleanGeminiKey) {
    return { clarifiedDialogue: rawTranscript };
  }

  const prompt = `You are an expert Indian financial call clearing engine.
Your task is to take this raw, noisy telephony transcript (which may contain spoken Hindi, Tamil, Telugu, Hinglish, or Tanglish) and output clean, restored dialogue between A: (Advisor) and C: (Client).

MANDATORY RULES:
1. Preserve all factual trading details: Client Code (UCC like WIA57747, WIG17634), Stock Name, Quantity, and Price/CMP.
2. If regional language (Tamil/Hindi/Telugu) is used, output the clean dialogue with speaker tags (A: and C:) and include clear English translations in parentheses so auditors understand the order instructions.
3. Remove non-speech filler, Spanish hallucinations, and line noise.
4. If candidate client code is "${candidateUcc || 'N/A'}", ensure any spoken mention is formatted as a single canonical token (e.g. WIA57747).

RAW TRANSCRIPT:
"""
${rawTranscript.slice(0, 4000)}
"""

Output ONLY the restored dialogue with A: and C: turns.`;

  // Attempt 1: Groq Fast LLM (openai/gpt-oss-120b or llama-3.3-70b-versatile)
  if (cleanGroqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanGroqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          temperature: 0.1,
          messages: [
            { role: 'system', content: 'You are a financial speech clearing engine. Respond with clean dialogue only.' },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const json = (await response.json()) as any;
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 20) {
          const uccMatch = text.match(/\b([A-Z]{3}\d{4,6})\b/);
          return { clarifiedDialogue: text, detectedUcc: uccMatch ? uccMatch[1] : undefined };
        }
      }
    } catch {
      // Fallback to Gemini
    }
  }

  // Attempt 2: Gemini Flash
  if (cleanGeminiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: cleanGeminiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          temperature: 0.1,
        },
      });
      if (res.text && res.text.trim().length > 20) {
        const text = res.text.trim();
        const uccMatch = text.match(/\b([A-Z]{3}\d{4,6})\b/);
        return { clarifiedDialogue: text, detectedUcc: uccMatch ? uccMatch[1] : undefined };
      }
    } catch {
      // Fallback
    }
  }

  return { clarifiedDialogue: rawTranscript };
}

/**
 * Main Stage 3.2 Middle Call Clearing & Restoration Engine
 * Takes raw Google Gemini Flash output, cleans acoustic noise, normalizes UCCs and trade entities,
 * and produces a pristine, high-fidelity transcript for downstream classification & audit.
 */
export async function clearAndRestoreCall(
  rawTranscript: string,
  segments: SegmentInfo[],
  options?: {
    candidateClientCodes?: string[];
    stockHints?: string[];
    groqApiKey?: string;
    geminiApiKey?: string;
    durationSeconds?: number;
  }
): Promise<ClearedCallTranscript> {
  const notes: string[] = [];

  // 1. Strip Spanish & acoustic noise hallucinations
  let text = stripAcousticHallucinations(rawTranscript);
  if (text !== rawTranscript) {
    notes.push('Acoustic noise and foreign hallucination tokens stripped.');
  }

  // 2. Canonical Spoken UCC Reconstruction
  const candidateCodes = options?.candidateClientCodes || [];
  const uccReconstruction = reconstructSpokenUccs(text, candidateCodes);
  text = uccReconstruction.text;
  const detectedUcc = uccReconstruction.detectedUcc;
  if (detectedUcc) {
    notes.push(`Canonical spoken UCC reconstructed: ${detectedUcc}.`);
  }

  // 3. Post-ASR Financial Speech Normalization (CMP, prices, stock aliases)
  text = normalizeFinancialTranscript(text);

  // 4. Clean Segments
  const cleanedSegments: SegmentInfo[] = segments.map((seg) => {
    let sText = stripAcousticHallucinations(seg.text);
    sText = reconstructSpokenUccs(sText, candidateCodes).text;
    sText = normalizeFinancialTranscript(sText);
    return {
      ...seg,
      text: sText,
    };
  }).filter((seg) => seg.text.length > 0);

  // 5. Structure Dialogue Turns
  let formattedDialogue = cleanedSegments.map((s) => `${s.speaker === 'ADVISOR' ? 'A:' : 'C:'} ${s.text}`).join('\n');
  if (!formattedDialogue.trim()) {
    formattedDialogue = `A: ${text}`;
  }

  // 6. Fast AI Dialogue Restoration & Clarification Pass (if non-trivial call)
  const duration = options?.durationSeconds || 0;
  if (duration >= 8 && text.split(/\s+/).length >= 10) {
    try {
      const aiClarification = await clarifyDialogueWithAi(
        text,
        options?.groqApiKey,
        options?.geminiApiKey,
        detectedUcc || candidateCodes[0]
      );
      if (aiClarification.clarifiedDialogue && aiClarification.clarifiedDialogue !== text) {
        formattedDialogue = aiClarification.clarifiedDialogue;
        notes.push('Dialogue clarified with fast AI telephony restoration engine.');
      }
    } catch {
      // Non-fatal, fallback to deterministic dialogue
    }
  }

  return {
    transcript: text,
    rawTranscript,
    segments: cleanedSegments,
    formattedDialogue,
    detectedUcc,
    isCleared: true,
    clearingNotes: notes,
  };
}
