// =============================================================
// AuditEQ — LLM Post-Correction Layer (Spelling & Grammar Sweep)
// Step 3 of High-Accuracy South Asian Telephony Auditing
// =============================================================

export interface LlmCorrectionOptions {
  apiKey?: string;
  model?: string;
  language?: string;
  clientCode?: string;
  stockHints?: string[];
}

const SYSTEM_CORRECTION_PROMPT =
  "You are an expert South Asian call center auditor. Review this raw transcript containing English, Hindi, Tamil, or Telugu speech. Correct minor phonetic typos, fix broken brand/product names, and repair sentence fragments caused by background noise. Do NOT remove filler words or change speaker labels.";

/**
 * Runs a fast, non-destructive LLM correction sweep over the transcribed text
 * to correct phonetic homophones, brand spellings (e.g. "find india" -> "FundsIndia"),
 * UCC abbreviations (e.g. "double u i a" -> "WIA"), and number formatting.
 */
export async function correctTranscriptWithLlm(
  rawTranscript: string,
  options?: LlmCorrectionOptions
): Promise<string> {
  if (!rawTranscript || rawTranscript.trim().length === 0) {
    return rawTranscript;
  }

  const groqApiKey = options?.apiKey || process.env.GROQ_API_KEY;
  if (!groqApiKey || !groqApiKey.trim()) {
    // If no Groq API key available, return original transcript without failure
    return rawTranscript;
  }

  const model = options?.model || 'openai/gpt-oss-20b';

  const userPrompt = [
    `Context: Indian financial equity trading pre-order call.`,
    options?.clientCode ? `Expected Client Code: ${options.clientCode}` : '',
    options?.stockHints && options.stockHints.length > 0 ? `Stock Hints: ${options.stockHints.join(', ')}` : '',
    `\nPlease fix any phonetic transcription typos, brand spellings, and broken grammar in the following transcript. Maintain the exact [mm:ss] SPEAKER: format on every line. Output ONLY the corrected transcript text:\n`,
    rawTranscript,
  ].filter(Boolean).join('\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_CORRECTION_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[LlmCorrection] LLM sweep skipped (status ${res.status}). Using raw transcript.`);
      return rawTranscript;
    }

    const data = await res.json();
    const corrected = data?.choices?.[0]?.message?.content?.trim();

    // Verify output isn't empty and maintains reasonable length
    if (corrected && corrected.length > rawTranscript.length * 0.5) {
      return corrected;
    }
  } catch (err: any) {
    console.warn(`[LlmCorrection] Warning during LLM post-correction:`, err?.message);
  }

  return rawTranscript;
}
