const fs = require('fs');
const path = require('path');

const deepgramApiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';

async function scanCalls() {
  const files = fs.readdirSync('.data/uploads').filter(f => f.endsWith('.mp3'));
  console.log(`Scanning up to 30 files from ${files.length} downloaded files...`);

  let withSpeech = 0;
  let emptySpeech = 0;

  for (let i = 0; i < Math.min(30, files.length); i++) {
    const f = files[i];
    const full = path.join('.data/uploads', f);
    const audioBuffer = fs.readFileSync(full);
    if (audioBuffer.length < 3000) continue; // skip tiny

    const url = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&detect_language=true';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Token ' + deepgramApiKey,
          'Content-Type': 'audio/mp3'
        },
        body: audioBuffer
      });
      if (!resp.ok) continue;
      const res = await resp.json();
      const tr = res.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
      const lang = res.results?.channels?.[0]?.detected_language || res.results?.channels?.[0]?.alternatives?.[0]?.detected_language;
      if (tr && tr.length > 0) {
        withSpeech++;
        console.log(`[SPEECH] [${lang}] ${f} (${audioBuffer.length}b): ${tr.slice(0, 100)}...`);
      } else {
        emptySpeech++;
      }
    } catch (e) {
      console.error(e.message);
    }
  }

  console.log(`Done. Found speech in ${withSpeech} files, empty/silence in ${emptySpeech} files.`);
}

scanCalls().catch(console.error);
