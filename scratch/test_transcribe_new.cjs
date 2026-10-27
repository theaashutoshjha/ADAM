const fs = require('node:fs');
const path = require('node:path');

const apiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';
const filePath = '.data/uploads/HYD12-T10-1791268999.145965.mp3';

async function testTranscribeNew() {
  const audioBuffer = fs.readFileSync(filePath);
  const params = new URLSearchParams({
    model: 'nova-3',
    detect_language: 'true',
    smart_format: 'true',
    punctuate: 'true',
    diarize: 'true',
    utterances: 'true',
  });

  const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'audio/mpeg'
    },
    body: audioBuffer
  });

  console.log('Status:', resp.status);
  const data = await resp.json();
  if (resp.ok) {
    const transcript = data.results?.channels[0]?.alternatives[0]?.transcript;
    console.log('Detected Language:', data.results?.channels[0]?.detected_language);
    console.log('Transcript:', transcript);
  } else {
    console.log('Error:', data);
  }
}

testTranscribeNew();
