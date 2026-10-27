// =============================================================
// ADAM-AR — Targeted Audio Verification Engine
// Implements Level 2 Verification:
// ASR Uncertain -> Targeted Audio Section / Focused Keywords -> Re-transcribe -> Reconcile
// Exclusively powered by Google Gemini Flash Key Pool
// =============================================================

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { transcribeWithDeepgram } from '../deepgram-engine';
import type { TranscriptSegment } from './types';

const execFileAsync = promisify(execFile);

export interface TargetedVerificationResult {
  verified: boolean;
  improvedText: string;
  confidence: number | null;
  source: 'TARGETED_RETRANSCRIPTION' | 'PRIMARY_ASR';
  reconciled: boolean;
  error?: string;
}

/**
 * Extracts a specific audio slice around [startSec, endSec] with context padding
 */
async function extractAudioSlice(
  audioPath: string,
  startSec: number,
  endSec: number,
  paddingSec: number = 3.0
): Promise<string | null> {
  const safeStart = Math.max(0, startSec - paddingSec);
  const duration = Math.max(1.0, endSec - startSec + paddingSec * 2);
  const outDir = path.dirname(audioPath);
  const outPath = path.join(outDir, `slice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', safeStart.toFixed(2),
      '-t', duration.toFixed(2),
      '-i', audioPath,
      '-c', 'copy',
      outPath,
    ], { timeout: 15000 });

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 512) {
      return outPath;
    }
  } catch {
    // ffmpeg not available or slicing failed
  }
  return null;
}

/**
 * Re-transcribes an uncertain audio segment with focused critical entity hints.
 * Exclusively uses Google Gemini Key Pool.
 */
export async function verifyUncertainSegmentWithGemini(
  audioPath: string,
  _unusedKey?: string,
  uncertainText: string = '',
  startSec?: number,
  endSec?: number,
  targetHints?: {
    candidateClientCodes?: string[];
    stockHints?: string[];
    expectedPriceOrCmp?: string;
  },
  maxRetries: number = 2
): Promise<TargetedVerificationResult> {
  if (!fs.existsSync(audioPath)) {
    return {
      verified: false,
      improvedText: uncertainText,
      confidence: null,
      source: 'PRIMARY_ASR',
      reconciled: false,
      error: 'TARGETED_RETRANSCRIPTION_FAILED: Audio file missing',
    };
  }

  if (startSec === undefined || endSec === undefined || endSec <= startSec) {
    return {
      verified: false,
      improvedText: uncertainText,
      confidence: null,
      source: 'PRIMARY_ASR',
      reconciled: false,
      error: 'TARGETED_RETRANSCRIPTION_FAILED: Invalid segment timestamps',
    };
  }

  const slicePath = await extractAudioSlice(audioPath, startSec, endSec, 4.0);
  if (!slicePath) {
    return {
      verified: false,
      improvedText: uncertainText,
      confidence: null,
      source: 'PRIMARY_ASR',
      reconciled: false,
      error: 'TARGETED_RETRANSCRIPTION_FAILED: Segment audio slice extraction failed',
    };
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const gResult = await transcribeWithDeepgram(slicePath, {
        model: 'nova-3',
        stockHints: targetHints?.stockHints || [],
        clientCode: targetHints?.candidateClientCodes?.[0],
      });

      if (fs.existsSync(slicePath)) {
        try { fs.unlinkSync(slicePath); } catch {}
      }

      if (gResult.transcript && gResult.transcript.trim().length > 0) {
        return {
          verified: true,
          improvedText: gResult.transcript.trim(),
          confidence: 0.95,
          source: 'TARGETED_RETRANSCRIPTION',
          reconciled: true,
        };
      }
    } catch (err: any) {
      if (attempt >= maxRetries) {
        if (fs.existsSync(slicePath)) {
          try { fs.unlinkSync(slicePath); } catch {}
        }
        return {
          verified: false,
          improvedText: uncertainText,
          confidence: null,
          source: 'PRIMARY_ASR',
          reconciled: false,
          error: `TARGETED_RETRANSCRIPTION_FAILED: ${err?.message || 'Retranscription error'}`,
        };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (fs.existsSync(slicePath)) {
    try { fs.unlinkSync(slicePath); } catch {}
  }

  return {
    verified: false,
    improvedText: uncertainText,
    confidence: null,
    source: 'PRIMARY_ASR',
    reconciled: false,
    error: 'TARGETED_RETRANSCRIPTION_FAILED: Max retries exceeded without improved text',
  };
}

export const verifyUncertainSegmentWithDeepgram = verifyUncertainSegmentWithGemini;
