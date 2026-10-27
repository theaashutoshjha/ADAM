const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const execFileAsync = promisify(execFile);
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const installer = require('@ffmpeg-installer/ffmpeg');
const ffmpegPath = installer.path;

async function checkAudio(filePath) {
  try {
    const { stdout, stderr } = await execFileAsync(ffmpegPath, ['-i', filePath], { maxBuffer: 10 * 1024 * 1024 });
    return stderr;
  } catch (err) {
    return err.stderr || err.message;
  }
}

async function run() {
  const calls = [1, 28, 50, 52, 80, 98, 124, 200, 302, 331, 378, 478, 514, 532];
  for (const id of calls) {
    const row = db.prepare('SELECT id, client_code, storage_path, duration_seconds, transcript FROM calls WHERE id = ?').get(id);
    const info = await checkAudio(row.storage_path);
    const durMatch = info.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    const realDur = durMatch ? (parseInt(durMatch[1])*3600 + parseInt(durMatch[2])*60 + parseFloat(durMatch[3])) : 'Unknown';
    const size = fs.existsSync(row.storage_path) ? fs.statSync(row.storage_path).size : 0;
    console.log(`Call #${id} [${row.client_code}]: DB dur=${row.duration_seconds}s, Real audio dur=${realDur}s, File size=${size} bytes`);
    console.log(`   Transcript (${row.transcript ? row.transcript.length : 0} chars): "${(row.transcript || '').slice(0, 100).replace(/\n/g, ' ')}"`);
  }
}

run();
