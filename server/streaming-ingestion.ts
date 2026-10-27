// =============================================================
// AuditEQ — Streaming Audio Ingestion (WebRTC / Chunked WebSocket)
// Supports real-time telephony streaming from PBX, Smartflo, or WebRTC
// =============================================================

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import fs from 'fs';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { applyDspNoiseFilter } from './audio-dsp';
import { transcribeWithDeepgram } from './deepgram-engine';
import { findAndAuditPreOrderForTrade } from './pipeline/preorder-finder';

export interface ActiveStreamSession {
  sessionId: string;
  callerId: string;
  customerNumber: string;
  sampleRate: number;
  channels: number;
  chunks: Buffer[];
  totalBytes: number;
  startTime: number;
  lastChunkTime: number;
  ws?: WebSocket;
}

const activeSessions = new Map<string, ActiveStreamSession>();

/**
 * Initializes the Streaming Audio WebSocket & Chunked Ingestion Server
 */
export function initializeStreamingIngestion(httpServer: Server, db: DatabaseSync): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    if (pathname === '/ws/audio-stream' || pathname === '/api/stream/audio') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let currentSessionId: string | null = null;

    ws.on('message', async (message: Buffer | string) => {
      // 1. Text control frames (JSON)
      if (typeof message === 'string' || (Buffer.isBuffer(message) && message.length < 512 && message[0] === 123)) {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.type === 'START_STREAM') {
            currentSessionId = payload.sessionId || `stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            activeSessions.set(currentSessionId, {
              sessionId: currentSessionId,
              callerId: payload.callerId || 'TELEPHONY_STREAM',
              customerNumber: payload.customerNumber || '',
              sampleRate: payload.sampleRate || 8000,
              channels: payload.channels || 1,
              chunks: [],
              totalBytes: 0,
              startTime: Date.now(),
              lastChunkTime: Date.now(),
              ws,
            });

            ws.send(JSON.stringify({ type: 'STREAM_STARTED', sessionId: currentSessionId, status: 'READY_FOR_AUDIO' }));
            return;
          }

          if (payload.type === 'END_STREAM') {
            const sessId = payload.sessionId || currentSessionId;
            if (sessId && activeSessions.has(sessId)) {
              const session = activeSessions.get(sessId)!;
              activeSessions.delete(sessId);
              const result = await finalizeStreamSession(session, db);
              ws.send(JSON.stringify({ type: 'STREAM_FINALIZED', sessionId: sessId, result }));
            }
            return;
          }
        } catch {
          // If not JSON, process as binary chunk
        }
      }

      // 2. Binary audio chunk streaming
      if (Buffer.isBuffer(message) && currentSessionId && activeSessions.has(currentSessionId)) {
        const session = activeSessions.get(currentSessionId)!;
        session.chunks.push(message);
        session.totalBytes += message.length;
        session.lastChunkTime = Date.now();

        // Real-time chunk confirmation
        ws.send(JSON.stringify({
          type: 'CHUNK_ACK',
          sessionId: currentSessionId,
          receivedBytes: session.totalBytes,
        }));
      }
    });

    ws.on('close', async () => {
      if (currentSessionId && activeSessions.has(currentSessionId)) {
        const session = activeSessions.get(currentSessionId)!;
        activeSessions.delete(currentSessionId);
        await finalizeStreamSession(session, db);
      }
    });
  });

  console.log('[StreamingIngestion] WebSocket streaming mounted at /ws/audio-stream and /api/stream/audio');
  return wss;
}

/**
 * Finalizes an audio stream: Saves to disk, applies Audio DSP Noise Filter,
 * runs Deepgram Nova-2 Diarization, and matches against executed trades.
 */
export async function finalizeStreamSession(session: ActiveStreamSession, db: DatabaseSync): Promise<any> {
  const combinedBuffer = Buffer.concat(session.chunks);
  const uploadsDir = path.join(process.cwd(), 'uploads', 'recordings');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const rawFilePath = path.join(uploadsDir, `${session.sessionId}_raw.wav`);

  // Write WAV header if missing
  if (combinedBuffer.length > 44 && combinedBuffer.toString('utf8', 0, 4) === 'RIFF') {
    fs.writeFileSync(rawFilePath, combinedBuffer);
  } else {
    // Wrap raw PCM stream into standard WAV header
    const wavHeader = Buffer.alloc(44);
    const pcmLen = combinedBuffer.length;
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + pcmLen, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // subchunk1size (16 for PCM)
    wavHeader.writeUInt16LE(1, 20); // audioFormat (1 for PCM)
    wavHeader.writeUInt16LE(session.channels, 22);
    wavHeader.writeUInt32LE(session.sampleRate, 24);
    wavHeader.writeUInt32LE(session.sampleRate * session.channels * 2, 28); // byteRate
    wavHeader.writeUInt16LE(session.channels * 2, 32); // blockAlign
    wavHeader.writeUInt16LE(16, 34); // bitsPerSample
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(pcmLen, 40);

    fs.writeFileSync(rawFilePath, Buffer.concat([wavHeader, combinedBuffer]));
  }

  // 1. Audio Pre-Filter DSP Noise Reduction (Telephony Bandpass + Noise Gate + Normalization)
  const dspRes = await applyDspNoiseFilter(rawFilePath);
  const cleanAudioPath = dspRes.outputPath;
  const durationSec = dspRes.metrics.durationSeconds;

  // 2. Ingest Call Record into Database
  const now = new Date().toISOString();
  const timeStr = new Date().toTimeString().split(' ')[0];
  const dateStr = new Date().toISOString().split('T')[0];

  const callRes = db.prepare(`
    INSERT INTO calls (
      canonical_call_id, caller_id, original_filename, storage_path,
      customer_number, calling_number, phone_number,
      call_date, call_time, duration_seconds,
      classification, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'imported', ?, ?)
  `).run(
    session.sessionId, session.callerId, path.basename(cleanAudioPath), cleanAudioPath,
    session.customerNumber, session.customerNumber, session.customerNumber,
    dateStr, timeStr, durationSec, now, now
  );

  const callId = Number(callRes.lastInsertRowid);

  // 3. Deepgram Nova-3 Transcription & Speaker Diarization
  const dgRes = await transcribeWithDeepgram(cleanAudioPath, {
    model: 'nova-3',
    clientCode: session.customerNumber,
  });

  db.prepare(`
    UPDATE calls SET
      transcript = ?,
      transcript_raw = ?,
      transcript_status = 'VALID',
      transcript_model = 'deepgram-nova-3',
      duration_seconds = ?
    WHERE id = ?
  `).run(dgRes.transcript, dgRes.rawTranscript, dgRes.durationSeconds || durationSec, callId);

  // Save segments
  const insSeg = db.prepare(`
    INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of dgRes.segments) {
    insSeg.run(callId, s.segment_id, s.start_time, s.end_time, s.speaker, s.text, now);
  }

  return {
    callId,
    sessionId: session.sessionId,
    durationSeconds: durationSec,
    transcript: dgRes.transcript,
    segmentsCount: dgRes.segments.length,
    isTwoWayConversation: dgRes.isTwoWayConversation,
  };
}
