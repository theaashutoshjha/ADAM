const fs = require('fs');
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('.data/auditeq_production.db');

const rows = db.prepare('SELECT id, storage_path, client_code, transcript FROM calls WHERE transcript IS NOT NULL').all();
const badCalls = [];
for (const r of rows) {
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u0600-\u06ff¿¡]|Sorayım|Fawarij|Murah|Aló|Bueno\?/i.test(r.transcript)) {
    badCalls.push(r);
  }
}

console.log(`Starting retranscription for ${badCalls.length} hallucinated calls...`);

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) {
  console.error('No DEEPGRAM_API_KEY found!');
  process.exit(1);
}

async function transcribeOne(call) {
  if (!call.storage_path || !fs.existsSync(call.storage_path)) {
    console.log(`Call #${call.id}: missing file on disk`);
    return;
  }

  const buffer = fs.readFileSync(call.storage_path);
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en-IN',
    smart_format: 'true',
    punctuate: 'true',
    diarize: 'true',
  });
  if (call.client_code) params.append('keyterm', call.client_code);

  try {
    const res = await fetch('https://api.deepgram.com/v1/listen?' + params.toString(), {
      method: 'POST',
      headers: { 'Authorization': 'Token ' + apiKey, 'Content-Type': 'audio/mp3' },
      body: buffer
    });
    const data = await res.json();
    let transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    transcript = transcript.trim();
    if (!transcript) {
      transcript = '[Silence / No speech detected]';
    }

    db.prepare('UPDATE calls SET transcript = ?, spoken_language = ?, transcript_status = ? WHERE id = ?')
      .run(transcript, 'en-IN', 'VALID', call.id);

    console.log(`Call #${call.id} fixed: ${transcript.slice(0, 60)}...`);
  } catch (err) {
    console.error(`Error on Call #${call.id}:`, err.message);
  }
}

async function runAll() {
  const BATCH_SIZE = 6;
  for (let i = 0; i < badCalls.length; i += BATCH_SIZE) {
    const batch = badCalls.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(transcribeOne));
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, badCalls.length)} / ${badCalls.length}`);
  }
  console.log('Finished retranscribing foreign hallucinated calls!');
}

runAll();
