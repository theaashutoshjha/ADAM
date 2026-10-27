import fs from 'node:fs';
import path from 'node:path';
import type { SegmentInfo } from './evidence-extractor';
import { normalizeFinancialTranscript } from './asr-engine';

export type DeepgramLanguage = 'en' | 'en-IN' | 'hi' | 'ta' | 'te' | 'multi';
export type DeepgramErrorCode =
  | 'AWAITING_API_KEY'
  | 'AUDIO_FILE_MISSING'
  | 'AUDIO_EMPTY'
  | 'UNSUPPORTED_AUDIO_FORMAT'
  | 'ASR_PAYMENT_REQUIRED'
  | 'ASR_RATE_LIMITED'
  | 'ASR_BAD_REQUEST'
  | 'ASR_UNAUTHORIZED'
  | 'ASR_FORBIDDEN'
  | 'ASR_SERVER_ERROR'
  | 'ASR_TIMEOUT'
  | 'ASR_NETWORK_ERROR'
  | 'ASR_INVALID_RESPONSE'
  | 'ASR_EMPTY_TRANSCRIPT';

export class DeepgramTranscriptionError extends Error {
  readonly provider = 'deepgram' as const;
  readonly model = 'nova-3' as const;
  constructor(
    public readonly code: DeepgramErrorCode,
    message: string,
    public readonly options: {
      httpStatus?: number;
      requestId?: string;
      retryable?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'DeepgramTranscriptionError';
  }
  get httpStatus() {
    return this.options.httpStatus;
  }
  get requestId() {
    return this.options.requestId;
  }
  get retryable() {
    return this.options.retryable ?? false;
  }
}

export interface WordInfo {
  word: string;
  start: number;
  end: number;
  speaker?: string;
  confidence?: number;
  punctuated_word?: string;
  language?: string;
}

export interface TranscriptQualityReport {
  coverageRatio: number;
  firstWordTime: number;
  lastWordTime: number;
  totalWords: number;
  validTimedWords: number;
  invalidTimedWords: number;
  isCollapsed: boolean;
  issues: string[];
}

export interface DeepgramResult {
  provider: 'deepgram';
  transcript: string;
  rawTranscript: string;
  segments: SegmentInfo[];
  words: WordInfo[];
  rawResponse: unknown;
  requestId?: string;
  durationSeconds: number;
  modelUsed: 'nova-3';
  languageUsed: string;
  detectedLanguage?: string;
  confidence: number;
  channels: number;
  quality: TranscriptQualityReport;
}

export interface DeepgramTranscriptionOptions {
  preferredLanguage?: DeepgramLanguage;
  candidateClientCodes?: string[];
  stockHints?: string[];
  keyterms?: string[];
  timeoutMs?: number;
}

export const FOREIGN_HALLUCINATIONS_REGEX =
  /[¿¡]|\b(?:claro|nunca\s+hombre|te\s+puedo\s+hacer|gracias\b\s*,*\s*ok|por\s+favor|buen[oa]s?\s+d[ií]as?|de\s+nada|entonces|porque|sería\s+el|descansas|facebook|sondosa|pura\s+y\s+la|sabe\s+qu[eé]|te\s+conoces|cu[eé]nteme|d[oó]nde|cu[aá]l|cambiar|al[oó]|hola|solo\s+al[oó])\b/i;

const ENDPOINT = 'https://api.deepgram.com/v1/listen';
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes timeout to ensure 5+ minute calls never terminate prematurely
const MAX_TIMEOUT_MS = 600_000;
const MAX_KEYTERMS = 50; // Capped at 50 terms per Deepgram Nova-3 best practices

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
};

const DEFAULT_KEYTERMS = [
  // English financial & equity terms
  'WIA', 'WIF', 'WIC', 'WID', 'WIG', 'WIE', 'FIA', 'PWD',
  'UCC', 'client code', 'client ID', 'CMP', 'current market price',
  'market rate', 'quantity', 'shares', 'lots', 'buy', 'sell',
  'order placed', 'limit order', 'market order', 'booking profit',
  'call option', 'put option', 'delivery', 'demat', 'stop loss',
  // Hindi trading & authorization terms (Hi)
  'theek hai', 'kar do', 'bhav', 'le lo', 'bech do', 'kharidna', 'kharid lo', 'daal do',
  // Tamil trading & authorization terms (Ta)
  'seri', 'aamaa', 'vaangunga', 'vaanga', 'vithudunga', 'vilai', 'podunga',
  // Telugu trading & authorization terms (Te)
  'kondi', 'konali', 'ammeyandi', 'pettandi', 'vela', 'sare', 'avunu',
];

export function buildDeepgramKeyterms(
  candidateCodes: string[] = [],
  stockHints: string[] = [],
  extra: string[] = [],
  maxLimit: number = 100
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== 'string') return;
    const s = v.trim();
    if (!s || s.length > 200 || /[\r\n]/.test(s)) return;
    const k = s.toUpperCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  for (const c of candidateCodes) {
    const x = c.trim().toUpperCase();
    add(x);
    if (/^[A-Z]{3}\d{4,6}$/.test(x)) {
      const pfx = x.slice(0, 3);
      const digits = x.slice(3);
      const spacedDigits = digits.split('').join(' ');
      add(`${pfx} ${digits}`);
      add(`${pfx} ${spacedDigits}`);
      add(`${pfx.split('').join(' ')} ${spacedDigits}`);
      add(`${pfx} 0${digits}`);
      add(`${pfx} 0 ${spacedDigits}`);

      if (pfx === 'WIG') {
        add(`WIC ${digits}`);
        add(`WIC ${spacedDigits}`);
        add(`VIC ${digits}`);
        add(`VIG ${digits}`);
      } else if (pfx === 'WIA') {
        add(`VIA ${digits}`);
        add(`WIU ${digits}`);
      } else if (pfx === 'WIF') {
        add(`VIF ${digits}`);
      } else if (pfx === 'PWA') {
        add(`FIA ${digits}`);
        add(`PVA ${digits}`);
      }
    }
  }
  for (const s of stockHints) {
    const x = s.replace(/-(?:EQ|BE|SM|BZ|BL|ST)$/i, '').trim().toUpperCase();
    if (x.length >= 2) add(x);
  }
  for (const x of extra) add(x);
  for (const x of DEFAULT_KEYTERMS) add(x);
  return out.slice(0, maxLimit);
}

export function validateTranscriptCoverage(
  words: WordInfo[],
  durationSeconds: number
): TranscriptQualityReport {
  const issues: string[] = [];
  const valid = words
    .filter(
      (w) =>
        Number.isFinite(w.start) &&
        Number.isFinite(w.end) &&
        w.start >= 0 &&
        w.end > w.start
    )
    .map((w) => ({ start: w.start, end: w.end }))
    .sort((a, b) => a.start - b.start);
  const invalid = words.length - valid.length;
  if (!words.length)
    return {
      coverageRatio: 0,
      firstWordTime: 0,
      lastWordTime: 0,
      totalWords: 0,
      validTimedWords: 0,
      invalidTimedWords: 0,
      isCollapsed: true,
      issues: ['TRANSCRIPT_EMPTY: Deepgram returned zero words.'],
    };
  if (invalid)
    issues.push(`INVALID_WORD_TIMING: ${invalid} word(s) have invalid timestamps.`);
  if (!valid.length)
    return {
      coverageRatio: 0,
      firstWordTime: 0,
      lastWordTime: 0,
      totalWords: words.length,
      validTimedWords: 0,
      invalidTimedWords: invalid,
      isCollapsed: true,
      issues: [...issues, 'NO_VALID_WORD_TIMING: No usable word timestamps returned.'],
    };

  let total = 0,
    start = valid[0].start,
    end = valid[0].end;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].start <= end) end = Math.max(end, valid[i].end);
    else {
      total += end - start;
      start = valid[i].start;
      end = valid[i].end;
    }
  }
  total += end - start;
  const first = valid[0].start,
    last = valid[valid.length - 1].end;
  const duration = durationSeconds > 0 ? durationSeconds : Math.max(1, last);
  const ratio = Math.min(1, Math.max(0, total / duration));
  const collapsed = duration > 15 && valid.length < 5;
  if (collapsed)
    issues.push('TRANSCRIPT_COLLAPSE: Very low valid word count for audio duration.');
  if (first > 10 && duration > 20)
    issues.push(`LARGE_START_GAP: First recognized word begins at ${first.toFixed(2)}s.`);
  if (duration - last > 10 && duration > 20)
    issues.push(
      `LARGE_END_GAP: Last recognized word ends ${(duration - last).toFixed(2)}s before audio end.`
    );
  return {
    coverageRatio: Math.round(ratio * 10000) / 10000,
    firstWordTime: first,
    lastWordTime: last,
    totalWords: words.length,
    validTimedWords: valid.length,
    invalidTimedWords: invalid,
    isCollapsed: collapsed,
    issues,
  };
}

const round = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

const speaker = (v: unknown): 'ADVISOR' | 'CLIENT' | 'UNKNOWN' => {
  if (v === 0 || v === '0') return 'ADVISOR';
  if (v === 1 || v === '1') return 'CLIENT';
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s.includes('advisor') || s.includes('dealer') || s.endsWith('_0')) return 'ADVISOR';
    if (s.includes('client') || s.includes('customer') || s.endsWith('_1')) return 'CLIENT';
  }
  return 'UNKNOWN';
};

function segmentsFrom(utterances: any, words: any[]): SegmentInfo[] {
  const result: SegmentInfo[] = [];

  const buildFromWords = (wordList: any[]): SegmentInfo[] => {
    const segs: SegmentInfo[] = [];
    if (!wordList || !wordList.length) return segs;

    let sp = speaker(wordList[0]?.speaker);
    let text = '';
    let ss = round(wordList[0]?.start);
    let ee = round(wordList[0]?.end);
    let currentLangs = new Set<string>();

    const flush = () => {
      if (text.trim()) {
        segs.push({
          start: ss,
          end: ee >= ss ? ee : ss,
          text: normalizeFinancialTranscript(text.trim()),
          speaker: sp,
          languages: currentLangs.size > 0 ? Array.from(currentLangs) : undefined,
        });
      }
    };

    for (let i = 0; i < wordList.length; i++) {
      const w = wordList[i];
      const prevW = i > 0 ? wordList[i - 1] : null;
      const nextSpk = speaker(w?.speaker);
      const t = String(w?.punctuated_word ?? w?.word ?? '').trim();
      if (!t) continue;

      const gap = prevW ? (round(w?.start) - round(prevW?.end)) : 0;
      const prevHasPunct = prevW && /[.?!]$/.test(String(prevW?.punctuated_word ?? prevW?.word ?? ''));

      // Natural conversational boundaries: speaker change, pause > 1.2s, sentence end with pause > 0.4s, or long segment > 20s
      if (text.trim() && (nextSpk !== sp || gap > 1.2 || (prevHasPunct && gap > 0.4) || (round(w?.end) - ss > 20))) {
        flush();
        text = '';
        currentLangs = new Set<string>();
        ss = round(w?.start);
        sp = nextSpk;
      }

      if (!text.trim()) {
        sp = nextSpk;
        ss = round(w?.start);
      }

      text += `${text ? ' ' : ''}${t}`;
      if (w?.language) currentLangs.add(String(w.language));
      ee = round(w?.end);
    }
    flush();
    return segs;
  };

  const hasWords = Array.isArray(words) && words.length > 0;
  const lastWordEnd = hasWords ? round(words[words.length - 1]?.end) : 0;

  if (Array.isArray(utterances) && utterances.length) {
    for (const u of utterances) {
      const text = String(u?.transcript ?? '').trim();
      if (!text) continue;
      const s = round(u?.start),
        e = round(u?.end);
      const uttWords = hasWords ? words.filter((w: any) => round(w?.start) >= s - 0.1 && round(w?.end) <= e + 0.1) : [];
      const uttLangs = Array.from(new Set(uttWords.map((w: any) => w?.language).filter(Boolean)));
      result.push({
        start: s,
        end: e >= s ? e : s,
        text: normalizeFinancialTranscript(text),
        speaker: speaker(u?.speaker),
        languages: uttLangs.length > 0 ? uttLangs : undefined,
      });
    }

    // CRITICAL: Ensure full call transcription (never stop in the middle!)
    // If Deepgram utterances cut off before the audio ends, append remaining words
    if (hasWords && result.length > 0) {
      const lastUttEnd = result[result.length - 1].end;
      if (lastWordEnd > lastUttEnd + 0.5) {
        const trailingWords = words.filter((w: any) => round(w?.start) >= lastUttEnd - 0.2);
        if (trailingWords.length > 0) {
          const trailingSegs = buildFromWords(trailingWords);
          result.push(...trailingSegs);
        }
      }
    }

    // CRITICAL: Verify that utterances did not drop words in the middle
    // If utterances captured less than 90% of recognized words, build directly from complete word stream
    const totalUttWords = result.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    if (hasWords && words.length > 20 && totalUttWords < words.length * 0.9) {
      return buildFromWords(words);
    }

    return result;
  }

  // Fallback: build segments from words directly
  if (hasWords) {
    return buildFromWords(words);
  }

  return result;
}

function providerMessage(body: string): string {
  if (!body) return '';
  try {
    const x = JSON.parse(body);
    for (const v of [x?.err_msg, x?.message, x?.error, x?.err_code])
      if (typeof v === 'string' && v.trim()) return v.trim();
  } catch {}
  return body.slice(0, 500);
}

function classify(status: number, msg: string, id?: string): DeepgramTranscriptionError {
  const suffix = id ? ` request_id=${id}` : '';
  const detail = msg ? ` ${msg}` : '';
  if (status === 402)
    return new DeepgramTranscriptionError(
      'ASR_PAYMENT_REQUIRED',
      `Deepgram credits are unavailable. Do not retry in a loop.${detail}${suffix}`,
      { httpStatus: status, requestId: id, retryable: false }
    );
  if (status === 429)
    return new DeepgramTranscriptionError(
      'ASR_RATE_LIMITED',
      `Deepgram rate limited the request. Worker backoff required.${detail}${suffix}`,
      { httpStatus: status, requestId: id, retryable: true }
    );
  if (status === 401)
    return new DeepgramTranscriptionError(
      'ASR_UNAUTHORIZED',
      `Deepgram authentication failed.${detail}${suffix}`,
      { httpStatus: status, requestId: id }
    );
  if (status === 403)
    return new DeepgramTranscriptionError(
      'ASR_FORBIDDEN',
      `Deepgram rejected the project/request.${detail}${suffix}`,
      { httpStatus: status, requestId: id }
    );
  if (status === 400)
    return new DeepgramTranscriptionError(
      'ASR_BAD_REQUEST',
      `Deepgram rejected the request.${detail}${suffix}`,
      { httpStatus: status, requestId: id }
    );
  return new DeepgramTranscriptionError(
    status >= 500 ? 'ASR_SERVER_ERROR' : 'ASR_BAD_REQUEST',
    `Deepgram request failed (HTTP ${status}).${detail}${suffix}`,
    { httpStatus: status, requestId: id, retryable: status >= 500 }
  );
}

export async function transcribeWithDeepgramNova3(
  audioPath: string,
  apiKey?: string,
  options: DeepgramTranscriptionOptions = {}
): Promise<DeepgramResult> {
  const key = apiKey?.trim() || process.env.DEEPGRAM_API_KEY?.trim();
  if (!key)
    throw new DeepgramTranscriptionError(
      'AWAITING_API_KEY',
      'DEEPGRAM_API_KEY is required.'
    );

  if (!fs.existsSync(audioPath))
    throw new DeepgramTranscriptionError(
      'AUDIO_FILE_MISSING',
      `Audio file missing: ${audioPath}`
    );
  const st = fs.statSync(audioPath);
  if (!st.isFile())
    throw new DeepgramTranscriptionError(
      'AUDIO_FILE_MISSING',
      `Audio path is not a file: ${audioPath}`
    );
  if (st.size <= 0)
    throw new DeepgramTranscriptionError('AUDIO_EMPTY', `Audio file is empty: ${audioPath}`);

  const ext = path.extname(audioPath).toLowerCase(),
    mime = MIME[ext];
  if (!mime)
    throw new DeepgramTranscriptionError(
      'UNSUPPORTED_AUDIO_FORMAT',
      `Unsupported audio extension '${ext}'.`
    );

  const envLang = process.env.DEEPGRAM_LANGUAGE?.trim();
  const lang =
    options.preferredLanguage ||
    (envLang && ['en', 'en-IN', 'hi', 'ta', 'te', 'multi'].includes(envLang)
      ? (envLang as DeepgramLanguage)
      : 'multi');

  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || 'nova-3',
    language: 'multi',
    punctuate: 'true',
    smart_format: 'true',
    diarize: 'true',
    utterances: 'true',
    numerals: 'true',
  });

  // Target language hints for Nova-3 55-language engine (biases toward expected Indian telephony languages)
  params.append('language_hint', 'en');
  params.append('language_hint', 'hi');
  params.append('language_hint', 'ta');
  params.append('language_hint', 'te');

  // Speech-layer vocabulary biasing via keyterm (Nova-3 native parameter)
  const defaultKeyterms = [
    'WIA', 'WIC', 'WID', 'WIE',
    'WIF', 'WIG', 'FIA', 'PWA', 'PWD'
  ];
  for (const kt of defaultKeyterms) {
    params.append('keyterm', kt);
  }

  for (const k of buildDeepgramKeyterms(
    options.candidateClientCodes,
    options.stockHints,
    options.keyterms,
    100
  )) {
    params.append('keyterm', k);
  }

  const configured = Number(options.timeoutMs || process.env.DEEPGRAM_TIMEOUT_MS);
  const timeout = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(30000, Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS)
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let response: Response;
    const audioBuffer = fs.readFileSync(audioPath);
    try {
      response = await fetch(`${ENDPOINT}?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Token ${key}`, 'Content-Type': mime },
        body: audioBuffer as unknown as BodyInit,
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError')
        throw new DeepgramTranscriptionError(
          'ASR_TIMEOUT',
          `Deepgram request exceeded ${timeout}ms.`,
          { retryable: true, cause: e }
        );
      throw new DeepgramTranscriptionError(
        'ASR_NETWORK_ERROR',
        `Network error calling Deepgram: ${e instanceof Error ? e.message : String(e)}`,
        { retryable: true, cause: e }
      );
    }

    let text = await response.text();
    let requestId =
      response.headers.get('dg-request-id') ||
      response.headers.get('x-request-id') ||
      undefined;

    // Graceful language_hint fallback if rollout switchover is still pending:
    if (!response.ok && text.includes('language_hint') && params.has('language_hint')) {
      const fallbackParams = new URLSearchParams(params);
      fallbackParams.delete('language_hint');
      const retryRes = await fetch(`${ENDPOINT}?${fallbackParams.toString()}`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': mime,
        },
        body: audioBuffer as unknown as BodyInit,
      });
      if (retryRes.ok) {
        response = retryRes;
        text = await retryRes.text();
        requestId = retryRes.headers.get('dg-request-id') || retryRes.headers.get('x-request-id') || requestId;
      }
    }

    if (!response.ok) throw classify(response.status, providerMessage(text), requestId);

    let raw: any;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new DeepgramTranscriptionError(
        'ASR_INVALID_RESPONSE',
        'Deepgram returned invalid JSON.',
        { retryable: true, cause: e }
      );
    }

    const id = requestId || raw?.metadata?.request_id;
    const channel = raw?.results?.channels?.[0],
      alt = channel?.alternatives?.[0];
    if (!channel || !alt)
      throw new DeepgramTranscriptionError(
        'ASR_INVALID_RESPONSE',
        'Deepgram response has no usable channel/alternative.',
        { requestId: id, retryable: true }
      );

    let transcript = typeof alt.transcript === 'string' ? alt.transcript.trim() : '';
    let providerWords = Array.isArray(alt.words) ? alt.words : [];

    // Fallback 1: If primary attempt returned 0 words, retry with language=multi or language=ta
    if (!transcript && !providerWords.length) {
      const fallbackLangs: DeepgramLanguage[] = lang !== 'multi' ? ['multi', 'ta'] : ['ta', 'hi'];
      for (const fallbackLang of fallbackLangs) {
        try {
          const fallbackParams = new URLSearchParams(params);
          fallbackParams.set('language', fallbackLang);
          fallbackParams.delete('detect_language');
          const fbRes = await fetch(`${ENDPOINT}?${fallbackParams.toString()}`, {
            method: 'POST',
            headers: { Authorization: `Token ${key}`, 'Content-Type': mime },
            body: audioBuffer as unknown as BodyInit,
            signal: AbortSignal.timeout(60000),
          });
          if (fbRes.ok) {
            const fbText = await fbRes.text();
            const fbJson = JSON.parse(fbText);
            const fbAlt = fbJson?.results?.channels?.[0]?.alternatives?.[0];
            const fbTr = typeof fbAlt?.transcript === 'string' ? fbAlt.transcript.trim() : '';
            const fbWords = Array.isArray(fbAlt?.words) ? fbAlt.words : [];
            if (fbTr || fbWords.length) {
              transcript = fbTr;
              providerWords = fbWords;
              raw = fbJson;
              break;
            }
          }
        } catch {}
      }
    }

    // Fallback 2: Truly silent or no speech detected in audio file.
    // Gracefully handle empty recording without throwing unhandled exceptions that break the pipeline queue.
    if (!transcript && !providerWords.length) {
      const emptyDuration = Number(raw?.metadata?.duration) || 0;
      return {
        provider: 'deepgram',
        transcript: '[Silence / No speech detected]',
        rawTranscript: '[Silence / No speech detected]',
        segments: [],
        words: [],
        rawResponse: raw,
        requestId: id,
        durationSeconds: emptyDuration,
        modelUsed: 'nova-3',
        languageUsed: lang || 'multi',
        detectedLanguage: undefined,
        confidence: 0,
        channels: 1,
        quality: {
          coverageRatio: 0,
          firstWordTime: 0,
          lastWordTime: 0,
          totalWords: 0,
          validTimedWords: 0,
          invalidTimedWords: 0,
          isCollapsed: false,
          issues: ['No speech detected in audio recording.'],
        },
      };
    }

    const words: WordInfo[] = providerWords.map((w: any) => ({
      word: String(w?.word ?? ''),
      start: round(w?.start),
      end: round(w?.end),
      speaker: speaker(w?.speaker),
      confidence: typeof w?.confidence === 'number' ? w.confidence : undefined,
      punctuated_word:
        typeof w?.punctuated_word === 'string'
          ? w.punctuated_word
          : String(w?.word ?? ''),
      language: typeof w?.language === 'string' ? w.language : undefined,
    }));

    const duration = Number(raw?.metadata?.duration) || 0;
    const detected =
      typeof channel?.detected_language === 'string'
        ? channel.detected_language
        : undefined;
    const languageUsed = lang || detected || 'unknown';
    const segments = segmentsFrom(raw?.results?.utterances, providerWords);
    const quality = validateTranscriptCoverage(words, duration);

    // Anti-Hallucination check for Indian Telephony calls
    const isForeignHallucination =
      FOREIGN_HALLUCINATIONS_REGEX.test(transcript) ||
      (detected && !['hi', 'ta', 'te', 'en', 'en-IN'].includes(detected));

    if (isForeignHallucination && !(options as any)._retryPass) {
      console.warn(`[Deepgram] Foreign/hallucinated language detected ("${detected}"). Auto-retranscribing with Hindi...`);
      return transcribeWithDeepgramNova3(audioPath, apiKey, {
        ...options,
        preferredLanguage: 'hi',
        _retryPass: true,
      } as any);
    }

    if (isForeignHallucination) {
      quality.issues.push(
        'FOREIGN_HALLUCINATION: Non-Indian hallucination pattern detected.'
      );
    }

    const confidence = typeof alt.confidence === 'number' ? alt.confidence : 0;
    const channels =
      Number(raw?.metadata?.channels) || Number(raw?.results?.channels?.length) || 1;
    const normalized = normalizeFinancialTranscript(transcript);

    const time = (s: number) => {
      const n = Math.max(0, Math.floor(s));
      return `[${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}]`;
    };
    const formatted = segments
      .map((s) => `${time(s.start)} ${s.speaker}: ${s.text}`)
      .join('\n');

    return {
      provider: 'deepgram',
      transcript: formatted || normalized,
      rawTranscript: transcript,
      segments,
      words,
      rawResponse: raw,
      requestId: id,
      durationSeconds: duration,
      modelUsed: 'nova-3',
      languageUsed,
      detectedLanguage: detected,
      confidence,
      channels,
      quality,
    };
  } finally {
    clearTimeout(timer);
  }
}
