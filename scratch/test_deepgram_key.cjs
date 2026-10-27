const apiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';

async function testDeepgramKey() {
  const resp = await fetch('https://api.deepgram.com/v1/projects', {
    headers: { 'Authorization': `Token ${apiKey}` }
  });
  console.log('Deepgram projects status:', resp.status);
  const data = await resp.json();
  console.log('Deepgram response:', data);
}

testDeepgramKey().catch(e => console.error(e));
