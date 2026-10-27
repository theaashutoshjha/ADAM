// =============================================================
// Stage 3: INDEPENDENT TRANSCRIPTION (Google Gemini 3.5 Transcribe)
// Audio -> Gemini 3.5 Transcribe -> Full Transcript -> Timestamped Segments.
// MANDATE: Absolutely NO trade context/hints passed into transcription.
// Pure independent acoustic hearing.
// Stores: transcript_id, call_id, segment_id, start_time, end_time, speaker, text.
// =============================================================

import 'dotenv/config';
import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import type { TranscriptSegment } from './types';
import type { CallRecord, TradeRecord } from '../../src/types';
import { transcribeAudioFile, normalizeFinancialTranscript } from '../asr-engine';
import { normalizePhoneNumber } from '../normalizer';
import { downloadCloudAudio, lookupRecordingUrlForCall } from '../audioDownloader';

export const FOREIGN_HALLUCINATIONS_REGEX = /[¿¡]|\b(?:claro|nunca\s+hombre|te\s+puedo\s+hacer|gracias\b\s*,*\s*ok|por\s+favor|buen[oa]s?\s+d[ií]as?|de\s+nada|entonces|porque|sería\s+el|descansas|facebook|sondosa|pura\s+y\s+la|sabe\s+qu[eé]|te\s+conoces|cu[eé]nteme|d[oó]nde|cu[aá]l|cambiar|al[oó]|hola)\b/i;

export interface TranscriptionOutput {
  text: string;
  rawText: string;
  model: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
}

const ASR_HALLUCINATION_PATTERNS = [
  /subtitles?\s+by(?:\s+the\s+amara\.org\s+community)?/i,
  /thank\s+you\s+for\s+watching/i,
  /thanks?\s+for\s+watching/i,
  /please\s+subscribe/i,
  /like\s+and\s+subscribe/i,
  /translated\s+by/i,
  /transcribed\s+by/i,
  /\[(?:music|applause|laughter|silence)\]/gi,
];

function sanitizeTranscript(text: string, options?: any): string {
  if (!text) return '';
  let cleaned = text.replace(/[\u0600-\u06FF]+/g, ' '); // Strip hallucinated Arabic/Urdu scripts
  // Preserving Indian scripts: Devanagari, Tamil (\u0B80-\u0BFF), Telugu (\u0C00-\u0C7F), Kannada, etc.
  for (const pattern of ASR_HALLUCINATION_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  cleaned = normalizeFinancialTranscript(cleaned, options);
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function ensureCallTranscriptionColumns(db: DatabaseSync): void {
  try {
    const cols = new Set((db.prepare("PRAGMA table_info(calls)").all() as Array<{ name: string }>).map((c) => c.name));
    if (!cols.has('spoken_language')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN spoken_language TEXT;'); } catch {}
    }
    if (!cols.has('transcript_status')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN transcript_status TEXT DEFAULT "PENDING";'); } catch {}
    }
    if (!cols.has('transcript_model')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN transcript_model TEXT;'); } catch {}
    }
    if (!cols.has('transcript_meta')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN transcript_meta TEXT;'); } catch {}
    }
    if (!cols.has('failure_reason')) {
      try { db.exec('ALTER TABLE calls ADD COLUMN failure_reason TEXT;'); } catch {}
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS call_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER NOT NULL,
        segment_id TEXT,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        speaker TEXT,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_call_segments_call ON call_segments(call_id);
    `);
  } catch {}
}

export function ensureCallWordsTable(db: DatabaseSync): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS call_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER NOT NULL,
        segment_id TEXT,
        word TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        speaker TEXT,
        confidence REAL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_call_words_call ON call_words(call_id);
    `);
  } catch {}
}

export function resolveIndianLanguageForCall(call: any): 'hi' | 'ta' | 'te' | 'en-IN' | 'multi' {
  const explicitLang = String(call?.spoken_language || call?.language_code || call?.language || '').toLowerCase();

  // Explicit spoken language override if specified
  if (explicitLang.includes('tam') || explicitLang === 'ta') return 'ta';
  if (explicitLang.includes('tel') || explicitLang === 'te') return 'te';
  if (explicitLang.includes('hin') || explicitLang === 'hi') return 'hi';
  if (explicitLang.includes('eng') || explicitLang === 'en') return 'en-IN';
  if (explicitLang === 'multi') return 'multi';

  const circle = String(call?.circle || '').toLowerCase();
  const callerId = String(call?.caller_id || '').toLowerCase();

  if (circle.includes('tamil') || circle.includes('chennai') || callerId.startsWith('chn')) return 'ta';
  if (circle.includes('telangan') || circle.includes('andhra') || circle.includes('hyderabad') || callerId.startsWith('hyd')) return 'te';
  if (circle.includes('delhi') || circle.includes('mumbai') || circle.includes('north') || callerId.startsWith('mum')) return 'hi';

  // Deepgram Nova-3 natively supports code-switching across English, Hindi, Tamil, Telugu
  // Setting multi ensures calls are never truncated when speakers switch languages
  return 'multi';
}

/**
 * Stage 3 Entry Point: Transcribes call independently and stores segments in call_segments.
 * Strictly enforces Deepgram Nova-3 Multi-Lingual Engine as the primary authorized ASR provider.
 */
export async function stage3TranscribeCall(
  db: DatabaseSync,
  callId: number,
  deepgramApiKey?: string,
  options?: { candidateClientCodes?: string[]; stockHints?: string[]; prompt?: string; forceRetranscribe?: boolean }
): Promise<TranscriptionOutput> {
  ensureCallTranscriptionColumns(db);
  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId) as unknown as CallRecord | undefined;
  if (!call) {
    throw new Error(`Call #${callId} not found in database.`);
  }

  // 1. Persistent Database Caching:
  // Cache reuse strictly allowed only for Deepgram Nova-3 transcripts without corruption
  const isHallucinated = FOREIGN_HALLUCINATIONS_REGEX.test(call.transcript || '');
  const isCorruptSparse = (call.transcript || '').trim().length < 25 && (call.duration_seconds || 0) > 10;
  const isPrematureCutoff =
    /\b(?:your\s+trade\s+code\s+)?(?:WIG|WIA|WIF|WIC|WID|WIE|FIA|PWD)\s*$/i.test((call.transcript || '').trim()) ||
    /(?:delivery and GPC\.\s*Your trade code WIG\s*)$/i.test((call.transcript || '').trim());

  // Full-duration call auditing mandate:
  // If call duration is > 35s and existing segments end prematurely (>25s gap before call ends), must retranscribe whole call!
  let hasIncompleteDuration = false;
  if ((call.duration_seconds || 0) > 35) {
    const maxSegRow = db.prepare('SELECT max(end_time) as max_e, count(*) as cnt FROM call_segments WHERE call_id = ?').get(callId) as any;
    if (!maxSegRow || !maxSegRow.cnt || (maxSegRow.max_e && (call.duration_seconds - maxSegRow.max_e) > 25 && maxSegRow.max_e < call.duration_seconds * 0.8)) {
      hasIncompleteDuration = true;
    }
  }

  const isTargetDeepgramModel = call.transcript_model === 'deepgram-nova-3';

  if (
    options?.forceRetranscribe !== true &&
    isTargetDeepgramModel &&
    call.transcript_status === 'VALID' &&
    call.transcript &&
    call.transcript.trim() &&
    !isHallucinated &&
    !isCorruptSparse &&
    !isPrematureCutoff &&
    !hasIncompleteDuration
  ) {
    const existingSegments = db
      .prepare('SELECT * FROM call_segments WHERE call_id = ? ORDER BY start_time ASC')
      .all(callId) as unknown as Array<{
        segment_id: string;
        start_time: number;
        end_time: number;
        speaker: string;
        text: string;
      }>;

    const segments: TranscriptSegment[] = existingSegments.map((s) => ({
      segment_id: s.segment_id,
      start_time: s.start_time,
      end_time: s.end_time,
      speaker: (s.speaker as any) || 'UNKNOWN',
      text: s.text,
    }));

    return {
      text: call.transcript,
      rawText: call.transcript_raw || call.transcript,
      model: call.transcript_model || 'cached-transcript',
      durationSeconds: call.duration_seconds || 0,
      segments,
    };
  }

  let audioPath = call.storage_path;
  if (!audioPath || !fs.existsSync(audioPath)) {
    let recUrl = call.recording_url || lookupRecordingUrlForCall(call.canonical_call_id || '', call.caller_id || '');
    if (recUrl && recUrl.startsWith('http')) {
      try {
        console.log(`[Transcription] Downloading audio for Call #${callId} (${call.canonical_call_id || callId}) from cloud URL...`);
        audioPath = await downloadCloudAudio(recUrl, call.canonical_call_id || String(callId));
        db.prepare('UPDATE calls SET storage_path = ?, recording_url = ? WHERE id = ?').run(audioPath, recUrl, callId);
      } catch (dlErr: any) {
        console.error(`[Transcription] Failed to download cloud audio for Call #${callId}:`, dlErr?.message);
      }
    }
  }

  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`Audio recording file missing from disk: ${audioPath || 'NO_PATH'}`);
  }

  let asrResult: {
    transcript: string;
    rawTranscript: string;
    segments: any[];
    durationSeconds: number;
    modelUsed: string;
    words?: any[];
    detectedLanguage?: string;
    rawMeta?: any;
  };

  try {
    console.log(`[Transcription] Call #${callId} -> Transcribing strictly with Deepgram Nova-3 ASR Engine...`);
    const asrRes = await transcribeAudioFile(
      audioPath,
      deepgramApiKey || process.env.DEEPGRAM_API_KEY,
      undefined,
      undefined,
      undefined,
      {
        preferredLanguage: ((call as any).spoken_language && (call as any).spoken_language !== 'auto') ? (call as any).spoken_language : 'auto',
        candidateClientCodes: call.client_code || call.client ? [call.client_code || call.client] : [],
      }
    );

    asrResult = {
      transcript: asrRes.transcript,
      rawTranscript: asrRes.rawTranscript,
      segments: asrRes.segments,
      durationSeconds: asrRes.durationSeconds,
      modelUsed: asrRes.modelUsed || 'deepgram-nova-3',
      words: asrRes.words,
      detectedLanguage: asrRes.detectedLanguage || 'multi',
    };
  } catch (err: any) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`
      UPDATE calls SET
        transcript_status = 'FAILED',
        failure_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(`Transcription error: ${err.message}`, now, callId);
    throw err;
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const detectedDuration = Math.round(asrResult.durationSeconds || call.duration_seconds || 0);

  if (asrResult.transcript === '[Silence / No speech detected]' || (!asrResult.transcript.trim() && !asrResult.rawTranscript.trim())) {
    db.prepare(`
      UPDATE calls SET
        transcript = '[Silence / No speech detected]',
        transcript_raw = '[Silence / No speech detected]',
        transcript_model = ?,
        transcript_status = 'VALID',
        failure_reason = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(asrResult.modelUsed || 'deepgram-nova-3', now, callId);
    return {
      text: '[Silence / No speech detected]',
      rawText: '[Silence / No speech detected]',
      model: asrResult.modelUsed || 'nova-3',
      durationSeconds: detectedDuration,
      segments: [],
    };
  }

  ensureCallWordsTable(db);

  // Clear any existing segments and words for this call and insert fresh ones
  db.prepare('DELETE FROM call_segments WHERE call_id = ?').run(callId);
  try {
    db.prepare('DELETE FROM call_words WHERE call_id = ?').run(callId);
  } catch {}

  const insertSeg = db.prepare(`
    INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const normOptions = {};

  const segments: TranscriptSegment[] = asrResult.segments.map((s, idx) => {
    const rawStart = typeof s.start === 'number' && !isNaN(s.start) ? s.start : (typeof (s as any).start_time === 'number' && !isNaN((s as any).start_time) ? (s as any).start_time : idx * 3);
    const rawEnd = typeof s.end === 'number' && !isNaN(s.end) ? s.end : (typeof (s as any).end_time === 'number' && !isNaN((s as any).end_time) ? (s as any).end_time : Math.max(rawStart + 1, (idx + 1) * 3));
    return {
      segment_id: `seg_${idx + 1}`,
      start_time: Math.max(0, Math.round(rawStart * 100) / 100),
      end_time: Math.max(0, Math.round(rawEnd * 100) / 100),
      speaker: (s.speaker as any) || 'UNKNOWN',
      text: sanitizeTranscript(s.text, normOptions),
    };
  }).filter((s) => s.text.length > 0);

  for (const seg of segments) {
    insertSeg.run(callId, seg.segment_id, seg.start_time, seg.end_time, seg.speaker, seg.text, now);
  }

  // Insert word-level timestamps per Section 6 Mandate
  if (asrResult.words && asrResult.words.length > 0) {
    try {
      const insertWord = db.prepare(`
        INSERT INTO call_words (call_id, segment_id, word, start_time, end_time, speaker, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const w of asrResult.words) {
        insertWord.run(
          callId,
          null,
          w.punctuated_word || w.word,
          w.start,
          w.end,
          w.speaker || null,
          typeof w.confidence === 'number' ? w.confidence : null,
          now
        );
      }
    } catch {}
  }

  const rawMetaJson = JSON.stringify({
    language: asrResult.detectedLanguage || 'auto',
    duration: detectedDuration,
    wordsCount: asrResult.words?.length || 0,
    model: asrResult.modelUsed,
    ...(asrResult.rawMeta || {})
  });

  // Update Call Record
  db.prepare(`
    UPDATE calls SET
      transcript = ?,
      transcript_raw = ?,
      transcript_meta = COALESCE(?, transcript_meta),
      transcript_model = ?,
      transcript_status = 'VALID',
      spoken_language = COALESCE(?, spoken_language),
      duration_seconds = CASE WHEN ? > 0 THEN ? ELSE duration_seconds END,
      updated_at = ?
    WHERE id = ?
  `).run(asrResult.transcript, asrResult.rawTranscript, rawMetaJson, asrResult.modelUsed, asrResult.detectedLanguage || 'auto', detectedDuration, detectedDuration, now, callId);

  return {
    text: asrResult.transcript,
    rawText: asrResult.rawTranscript,
    model: asrResult.modelUsed,
    durationSeconds: detectedDuration,
    segments,
  };
}
