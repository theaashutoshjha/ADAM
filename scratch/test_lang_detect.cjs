const fs = require('node:fs');
const apiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';

async function testAudioTranscription() {
  const sampleAudio = '.data/uploads/HYD15-D13-1791517667.53991.mp3';
  if (!fs.existsSync(sampleAudio)) {
    console.log('Sample audio does not exist:', sampleAudio);
    return;
  }
  const audioBuffer = fs.readFileSync(sampleAudio);
  
  // Test with detect_language=true
  const params = new URLSearchParams({
    model: 'nova-2',
    detect_language: 'true',
    smart_format: 'true',
    punctuate: 'true',
    diarize: 'true',
    utterances: 'true'
  });
  
  const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'audio/mpeg'
    },
    body: audioBuffer
  });
  
  console.log('Status with detect_language=true on nova-2:', resp.status);
  const data = await resp.json();
  if (resp.ok) {
    console.log('Detected language:', data.results?.channels[0]?.detected_language);
    console.log('Transcript snippet:', data.results?.channels[0]?.alternatives[0]?.transcript?.slice(0, 200));
  } else {
    console.log('Error:', data);
  }
}

testAudioTranscription().catch(e => console.error(e));
