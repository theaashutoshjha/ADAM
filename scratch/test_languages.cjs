const fs = require('node:fs');
const apiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';
const filePath = '.data/uploads/HYD12-T10-1791268999.145965.mp3';

async function testLanguages() {
  const audioBuffer = fs.readFileSync(filePath);
  
  // Test with language=multi or language=hi or language=en-IN
  for (const lang of ['en-IN', 'hi', 'te', 'ta']) {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: lang,
      smart_format: 'true',
      punctuate: 'true',
      diarize: 'true',
    });

    const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/mpeg'
      },
      body: audioBuffer
    });

    console.log(`Nova-2 with language=${lang}: Status ${resp.status}`);
    const data = await resp.json();
    if (resp.ok) {
      console.log(`  ${lang} transcript:`, data.results?.channels[0]?.alternatives[0]?.transcript);
    } else {
      console.log(`  ${lang} error:`, data.err_msg || data.message || data);
    }
  }
}

testLanguages();
