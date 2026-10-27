const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const db = new DatabaseSync('.data/auditeq_production.db');

async function testCall1() {
  const call = db.prepare('SELECT * FROM calls WHERE id = 1').get();
  console.log('Call #1:', {
    id: call.id,
    caller_id: call.caller_id,
    calling_number: call.calling_number,
    client_code: call.client_code,
    storage_path: call.storage_path,
    matched_trade_id: call.matched_trade_id
  });

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(call.matched_trade_id);
  console.log('Matched Trade for Call #1:', trade);

  // Test Deepgram Nova-3 transcription
  const deepgramApiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';
  const audioBuffer = fs.readFileSync(call.storage_path);
  console.log('Audio file size:', audioBuffer.length);

  const url = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&diarize=true&detect_language=true';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${deepgramApiKey}`,
      'Content-Type': 'audio/mp3'
    },
    body: audioBuffer
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Deepgram API error:', resp.status, errText);
    return;
  }

  const result = await resp.json();
  const alt = result.results?.channels?.[0]?.alternatives?.[0];
  const detectedLang = alt?.detected_language || result.results?.channels?.[0]?.detected_language;
  console.log('Detected language:', detectedLang);
  console.log('Transcript:', alt?.transcript);
}

testCall1().catch(console.error);
