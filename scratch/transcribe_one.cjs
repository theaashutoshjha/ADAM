const fs = require('fs');

async function transcribeOne(path) {
  const deepgramApiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';
  const audioBuffer = fs.readFileSync(path);
  console.log(`Transcribing ${path} (Size: ${audioBuffer.length} bytes)...`);

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
    console.error('Deepgram API error:', resp.status, await resp.text());
    return;
  }

  const result = await resp.json();
  const alt = result.results?.channels?.[0]?.alternatives?.[0];
  const detectedLang = alt?.detected_language || result.results?.channels?.[0]?.detected_language;
  console.log('Detected language:', detectedLang);
  console.log('Words count:', alt?.words?.length);
  console.log('Transcript:', alt?.transcript);
}

async function run() {
  await transcribeOne('D:\\adam\\.data\\uploads\\HYD15-D15-1791344817.89991.mp3');
  await transcribeOne('D:\\adam\\.data\\uploads\\HYD15-D12-1790847213.28349.mp3');
  await transcribeOne('D:\\adam\\.data\\uploads\\HYD15-T2-1791949569.163977.mp3');
  await transcribeOne('D:\\adam\\.data\\uploads\\HYD15-T3-1791867661.75330.mp3');
}

run().catch(console.error);
