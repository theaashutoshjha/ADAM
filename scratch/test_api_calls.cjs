const http = require('node:http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/calls?type=pre_order&per_page=all',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer 4e3690725de4072e972478e366910e77fc002de87f1bf22b1ac26464c700e427'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const calls = JSON.parse(data);
      console.log('Total pre_order calls returned by API:', calls.length);
      const audited = calls.filter(c => c.audit_status === 'AUDITED' || c.status === 'audited');
      const auditedWithTranscripts = audited.filter(c => c.transcript && c.transcript.trim().length >= 15);
      const missingRecording = calls.filter(c => c.status === 'missing_recording');
      console.log('Audited pre_order calls:', audited.length);
      console.log('Audited pre_order calls with real transcripts:', auditedWithTranscripts.length);
      console.log('Missing recording calls:', missingRecording.length);
      if (audited.length > 0) {
        console.log('Sample genuine audited call:', {
          id: audited[0].id,
          caller_id: audited[0].caller_id,
          scorecard_score: audited[0].scorecard_score,
          q1_status: audited[0].q1_status,
          q2_status: audited[0].q2_status,
          q3_status: audited[0].q3_status,
          q4_status: audited[0].q4_status,
          q5_status: audited[0].q5_status,
          transcript_snippet: audited[0].transcript?.slice(0, 100)
        });
      }
    } catch (e) {
      console.error('Error:', e.message, data.slice(0, 200));
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.end();
