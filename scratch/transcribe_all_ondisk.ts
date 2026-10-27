import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { transcribeAudioFile } from '../server/asr-engine';

const db = new DatabaseSync('.data/auditeq_production.db');

const pendingCalls = db.prepare(`
  SELECT id, storage_path, duration_seconds 
  FROM calls 
  WHERE storage_path IS NOT NULL AND length(storage_path) > 0
    AND (transcript IS NULL OR length(trim(transcript)) < 15)
`).all() as any[];

console.log(`Found ${pendingCalls.length} on-disk calls to transcribe.`);

async function processInBatches(concurrency = 3) {
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < pendingCalls.length; i += concurrency) {
    const chunk = pendingCalls.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (c) => {
      if (!fs.existsSync(c.storage_path)) {
        return;
      }
      try {
        const res = await transcribeAudioFile(c.storage_path);
        db.prepare(`
          UPDATE calls SET 
            transcript = ?, 
            transcript_raw = ?, 
            transcript_status = 'VALID', 
            pipeline_stage = 'TRANSCRIPTION',
            updated_at = datetime('now') 
          WHERE id = ?
        `).run(res.transcript, res.rawTranscript, c.id);

        // Delete existing call segments and insert new ones
        db.prepare('DELETE FROM call_segments WHERE call_id = ?').run(c.id);
        const insSeg = db.prepare(`
          INSERT INTO call_segments (call_id, segment_id, start_time, end_time, speaker, text, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        for (const s of res.segments) {
          insSeg.run(c.id, s.segment_id || `seg_${c.id}`, s.start || 0, s.end || 3, s.speaker || 'UNKNOWN', s.text || '');
        }
        completed++;
        console.log(`[${completed}/${pendingCalls.length}] Call #${c.id} transcribed: ${res.transcript.slice(0, 50)}...`);
      } catch (err: any) {
        failed++;
        console.error(`Call #${c.id} failed:`, err.message);
      }
    }));
  }

  console.log(`Finished transcribing on-disk audio: ${completed} completed, ${failed} failed.`);
}

processInBatches().catch(e => console.error(e));
