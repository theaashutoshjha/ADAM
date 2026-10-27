const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const db = new DatabaseSync('.data/auditeq_production.db');
const uploadsDir = path.resolve('.data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

async function downloadPreOrdersFast() {
  const pendingCalls = db.prepare(`
    SELECT id, canonical_call_id, caller_id, original_filename, recording_url, storage_path
    FROM calls
    WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
      AND recording_url IS NOT NULL 
      AND length(trim(recording_url)) > 15
      AND (recording_url LIKE 'http%://cloudphone.tatateleservices.com%' OR recording_url LIKE 'http%://tatateleservices.com%')
    ORDER BY id ASC
  `).all();

  const toDownload = pendingCalls.filter((c) => {
    if (!c.storage_path || c.storage_path.trim() === '') return true;
    return !fs.existsSync(c.storage_path);
  });

  console.log(`[FastPreOrderDownloader] Found ${toDownload.length} pre-order calls needing download out of ${pendingCalls.length} total.`);
  if (toDownload.length === 0) {
    console.log('All pre-order audio files already downloaded!');
    return;
  }

  let completed = 0;
  let failed = 0;
  let currentIndex = 0;
  const concurrency = 12;

  const updateStmt = db.prepare(`
    UPDATE calls SET
      storage_path = ?,
      file_size = ?,
      status = CASE WHEN status = 'pending' THEN 'downloaded' ELSE status END,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  async function worker() {
    while (currentIndex < toDownload.length) {
      const idx = currentIndex++;
      const call = toDownload[idx];
      const callIdentifier = (call.caller_id || call.canonical_call_id || call.original_filename || `call_${call.id}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = path.join(uploadsDir, `${callIdentifier}.mp3`);

      try {
        const resp = await fetch(call.recording_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': '*/*'
          }
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length < 100) {
          throw new Error(`File too small: ${buffer.length}b`);
        }

        fs.writeFileSync(destPath, buffer);
        updateStmt.run(destPath, buffer.length, call.id);
        completed++;
        if (completed % 25 === 0 || completed === toDownload.length) {
          console.log(`[FastPreOrderDownloader] Progress: ${completed}/${toDownload.length} downloaded (${failed} failed)`);
        }
      } catch (err) {
        failed++;
        console.warn(`[FastPreOrderDownloader] Call #${call.id} failed: ${err.message}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log(`[FastPreOrderDownloader] FINISHED: ${completed} downloaded, ${failed} failed.`);
}

downloadPreOrdersFast().catch(console.error);
