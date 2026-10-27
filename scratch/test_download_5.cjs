const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('.data/auditeq_production.db');
const uploadsDir = path.resolve('.data/uploads');

const needDownload = db.prepare(`
  SELECT id, caller_id, recording_url, recording_name
  FROM calls
  WHERE (classification = 'PRE_ORDER' OR call_type = 'pre_order')
    AND recording_url IS NOT NULL AND length(recording_url) > 20
    AND (storage_path IS NULL OR storage_path = '' OR transcript IS NULL)
  LIMIT 5
`).all();

async function testDownload5() {
  for (const c of needDownload) {
    const filename = `${c.caller_id || `call_${c.id}`}.mp3`;
    const targetPath = path.join(uploadsDir, filename);
    console.log(`Downloading Call #${c.id} to ${filename}...`);
    try {
      const res = await fetch(c.recording_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(targetPath, buffer);
        db.prepare('UPDATE calls SET storage_path = ? WHERE id = ?').run(targetPath, c.id);
        console.log(`SUCCESS Call #${c.id}: ${buffer.length} bytes saved`);
      } else {
        console.log(`FAILED Call #${c.id}: HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`ERROR Call #${c.id}:`, e.message);
    }
  }
}

testDownload5();
