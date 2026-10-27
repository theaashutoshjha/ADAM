// =============================================================
// AuditEQ — Authoritative Deepgram Nova-3 Telephony ASR Engine
// Exclusively powered by Deepgram Nova-3 Multi-Lingual Architecture
// Optimized for Indian Financial Pre-Order Contact Centers (en, hi, ta, te)
// =============================================================

import fs from 'node:fs';
import path from 'node:path';
import {
  transcribeWithDeepgramNova3,
  buildDeepgramKeyterms,
  validateTranscriptCoverage,
  type DeepgramResult,
  type DeepgramLanguage,
  type DeepgramTranscriptionOptions,
  type WordInfo,
  type TranscriptQualityReport,
  DeepgramTranscriptionError,
} from './deepgram-transcriber';
import type { SegmentInfo } from './evidence-extractor';
import { normalizeFinancialTranscript } from './asr-engine';

export interface DeepgramSegment {
  segment_id: string;
  start_time: number;
  end_time: number;
  start: number;
  end: number;
  speaker: 'ADVISOR' | 'CLIENT' | 'UNKNOWN';
  raw_speaker?: string | number;
  text: string;
  confidence: number;
}

export type DeepgramWord = WordInfo;

export interface DeepgramTranscriptionResult {
  transcript: string;
  rawTranscript: string;
  segments: DeepgramSegment[];
  words: DeepgramWord[];
  durationSeconds: number;
  model: string;
  detectedLanguage: string;
  confidence: number;
  averageConfidence: number;
  needsManualReview: boolean;
  reviewReason?: string | null;
  diarizationMode: 'channel' | 'speaker';
  advisorSpeakerId: number | string;
  clientSpeakerId: number | string;
  isTwoWayConversation: boolean;
  jobId?: string;
  rawResult?: any;
}

/**
 * Normalizes language codes to Deepgram supported codes: 'en', 'en-IN', 'hi', 'ta', 'te', 'multi'
 */
export function normalizeDeepgramLanguage(lang?: string): DeepgramLanguage {
  if (!lang) return 'multi';
  const l = lang.toLowerCase().trim();
  if (l === 'en' || l === 'english') return 'en-IN';
  if (l.startsWith('en-')) return 'en-IN';
  if (l === 'hi' || l.startsWith('hi-') || l === 'hindi') return 'hi';
  if (l === 'ta' || l.startsWith('ta-') || l === 'tamil') return 'ta';
  if (l === 'te' || l.startsWith('te-') || l === 'telugu') return 'te';
  if (l === 'multi' || l === 'auto' || l === 'detect') return 'multi';
  return 'multi';
}

/**
 * Speaker Role Attribution based on Financial Pre-Order Cues
 */
export function attributeSpeakerRoles(
  utterances: Array<{ speaker: string | number; text: string; start: number }>
): { advisorSpeakerId: string | number; clientSpeakerId: string | number } {
  let scoreMap: Record<string, number> = {};

  const ADVISOR_PATTERNS = [
    /\b(?:fundsindia|funds\s+india|advisory|desk|dealer|equity\s+desk)\b/i,
    /\b(?:hello\s+sir|good\s+morning|good\s+afternoon|how\s+may\s+i\s+help|welcome\s+to\s+fundsindia)\b/i,
    /\b(?:this\s+is\s+[a-z]+\s+(?:calling\s+from|from)|calling\s+from\s+fundsindia)\b/i,
    /\b(?:client\s*(?:id|code)|ucc|verifying|verify\s+your|confirming\s+your|your\s+trade\s+code)\b/i,
    /\b(?:wia|wif|wic|wid|wig|wie|fia|pwd|pwa)\d{4,6}\b/i,
    /\b(?:order\s+(?:has\s+been\s+)?placed|placed\s+your\s+order|executed|limit\s+order\s+punched|punched\s+the\s+order|punching\s+it)\b/i,
    /\b(?:placing\s+your|order\s+is\s+confirmed|confirmation)\b/i,
  ];

  const CLIENT_PATTERNS = [
    /\b(?:buy\s+kar\s+do|sell\s+kar\s+do|kharid\s+lo|bech\s+do|order\s+daal\s+do|laga\s+do)\b/i,
    /\b(?:i\s+want\s+to\s+buy|please\s+buy|please\s+sell|place\s+an\s+order|buy\s+it|sell\s+it)\b/i,
    /\b(?:haan\s+bhai|theek\s+hai|kardo|kar\s+dijiye|yes\s+execute|okay\s+proceed|yes\s+please)\b/i,
    /\b(?:mera\s+client\s+code|my\s+client\s+id|my\s+ucc)\b/i,
    /\b(?:vaangunga|virka|vithudunga|podunga|seri|kondi|ammeyandi|pettandi)\b/i,
  ];

  for (const u of utterances) {
    const spk = String(u.speaker ?? 'UNKNOWN');
    if (!scoreMap[spk]) scoreMap[spk] = 0;
    const txt = u.text || '';

    for (const pat of ADVISOR_PATTERNS) {
      if (pat.test(txt)) scoreMap[spk] += 2;
    }
    for (const pat of CLIENT_PATTERNS) {
      if (pat.test(txt)) scoreMap[spk] -= 2;
    }
  }

  // First speaker greeting tie-breaker
  if (utterances.length > 0 && utterances[0].start < 4.0) {
    const firstSpk = String(utterances[0].speaker ?? 'UNKNOWN');
    if (scoreMap[firstSpk] !== undefined) {
      scoreMap[firstSpk] += 1;
    }
  }

  const sortedSpeakers = Object.keys(scoreMap).sort((a, b) => scoreMap[b] - scoreMap[a]);
  const advisorSpeakerId = sortedSpeakers[0] || 'ADVISOR';
  const clientSpeakerId = sortedSpeakers[1] || (advisorSpeakerId === 'ADVISOR' ? 'CLIENT' : 'ADVISOR');

  return { advisorSpeakerId, clientSpeakerId };
}

/**
 * Transcribes audio via Deepgram Nova-3 Multi-Lingual Engine
 */
export async function transcribeWithDeepgram(
  audioFilePath: string,
  options?: {
    apiKey?: string;
    model?: string;
    language?: string;
    preferredLanguage?: string;
    clientCode?: string;
    candidateClientCodes?: string[];
    stockHints?: string[];
    keyterms?: string[];
    timeoutMs?: number;
    [key: string]: any;
  }
): Promise<DeepgramTranscriptionResult> {
  const apiKey =
    options?.apiKey ||
    process.env.DEEPGRAM_API_KEY ||
    process.env.VITE_DEEPGRAM_API_KEY ||
    '';

  const candidateCodes = [
    ...(options?.candidateClientCodes || []),
    ...(options?.clientCode ? [options.clientCode] : []),
  ];

  const preferredLang = normalizeDeepgramLanguage(
    options?.preferredLanguage || options?.language
  );

  const dgRes: DeepgramResult = await transcribeWithDeepgramNova3(audioFilePath, apiKey, {
    preferredLanguage: preferredLang,
    candidateClientCodes: candidateCodes,
    stockHints: options?.stockHints,
    keyterms: options?.keyterms,
    timeoutMs: options?.timeoutMs,
  });

  const segments: DeepgramSegment[] = dgRes.segments.map((seg, idx) => ({
    segment_id: `seg_${idx + 1}`,
    start_time: seg.start,
    end_time: seg.end,
    start: seg.start,
    end: seg.end,
    speaker: seg.speaker as 'ADVISOR' | 'CLIENT' | 'UNKNOWN',
    text: seg.text,
    confidence: dgRes.confidence || 0.95,
  }));

  const isTwoWayConversation =
    segments.some((s) => s.speaker === 'CLIENT') && segments.some((s) => s.speaker === 'ADVISOR');

  const needsManualReview = (dgRes.confidence > 0 && dgRes.confidence < 0.70) || dgRes.quality?.isCollapsed;
  const reviewReason = needsManualReview
    ? `LOW_ASR_CONFIDENCE: Deepgram Nova-3 word confidence (${(dgRes.confidence * 100).toFixed(1)}%) is below 70% threshold.`
    : null;

  return {
    transcript: dgRes.transcript,
    rawTranscript: dgRes.rawTranscript,
    segments,
    words: dgRes.words,
    durationSeconds: dgRes.durationSeconds,
    model: 'deepgram-nova-3',
    detectedLanguage: dgRes.detectedLanguage || dgRes.languageUsed || 'multi',
    confidence: Math.round(dgRes.confidence * 1000) / 1000,
    averageConfidence: Math.round(dgRes.confidence * 1000) / 1000,
    needsManualReview,
    reviewReason,
    diarizationMode: 'speaker',
    advisorSpeakerId: 'ADVISOR',
    clientSpeakerId: 'CLIENT',
    isTwoWayConversation,
    jobId: dgRes.requestId,
    rawResult: dgRes.rawResponse,
  };
}

export async function probeIndianLanguage(): Promise<string> {
  return 'en-IN';
}

export {
  transcribeWithDeepgramNova3,
  buildDeepgramKeyterms,
  validateTranscriptCoverage,
  DeepgramTranscriptionError,
};
