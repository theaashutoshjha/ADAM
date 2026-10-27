const fs = require('fs');
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('.data/auditeq_production.db');

// Find all calls that have foreign language labels (es, it, id, de, vi, ru, fr, ja, pt, tr, fi)
const badCalls = db.prepare(`
  SELECT id, storage_path, client_code, transcript, spoken_language
  FROM calls
  WHERE spoken_language NOT IN ('en', 'en-IN', 'hi', 'ta', 'te')
    AND storage_path IS NOT NULL
`).all();

console.log(`Found ${badCalls.length} calls with non-Indian language labels.`);

const apiKey = process.env.DEEPGRAM_API_KEY;

async function fixOne(call) {
  if (!fs.existsSync(call.storage_path)) return;
  const buffer = fs.readFileSync(call.storage_path);

  // First try detect_language with Nova-3
  try {
    const params = new URLSearchParams({
      model: 'nova-3',
      detect_language: 'true',
      smart_format: 'true',
      punctuate: 'true',
    });
    if (call.client_code) params.append('keyterm', call.client_code);

    const res = await fetch('https://api.deepgram.com/v1/listen?' + params.toString(), {
      method: 'POST',
      headers: { 'Authorization': 'Token ' + apiKey, 'Content-Type': 'audio/mp3' },
      body: buffer
    });
    const data = await res.json();
    const rawDetected = data.results?.channels?.[0]?.detected_language || 'en';
    let finalLang = 'en';
    if (['hi', 'ta', 'te'].includes(rawDetected)) {
      finalLang = rawDetected;
    } else {
      finalLang = 'en';
    }

    // Now transcribe with finalLang (if finalLang is en, use en-IN)
    const transcribeLang = finalLang === 'en' ? 'en-IN' : finalLang;
    const transParams = new URLSearchParams({
      model: 'nova-3',
      language: transcribeLang,
      smart_format: 'true',
      punctuate: 'true',
    });
    if (call.client_code) transParams.append('keyterm', call.client_code);

    const transRes = await fetch('https://api.deepgram.com/v1/listen?' + transParams.toString(), {
      method: 'POST',
      headers: { 'Authorization': 'Token ' + apiKey, 'Content-Type': 'audio/mp3' },
      body: buffer
    });
    const transData = await transRes.json();
    let transcript = transData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    transcript = transcript.trim();
    if (!transcript) {
      transcript = '[Silence / No speech detected]';
    }

    db.prepare('UPDATE calls SET transcript = ?, spoken_language = ?, transcript_status = ? WHERE id = ?')
      .run(transcript, finalLang, 'VALID', call.id);

    console.log(`Call #${call.id} fixed [${finalLang}]: ${transcript.slice(0, 50)}...`);
  } catch (err) {
    console.error(`Error on Call #${call.id}:`, err.message);
  }
}

async function runAll() {
  const BATCH_SIZE = 6;
  for (let i = 0; i < badCalls.length; i += BATCH_SIZE) {
    const batch = badCalls.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(fixOne));
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, badCalls.length)} / ${badCalls.length}`);
  }
  console.log('Finished fixing all non-Indian language calls!');
}

runAll();
