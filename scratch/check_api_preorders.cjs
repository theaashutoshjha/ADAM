const http = require('node:http');

http.get('http://localhost:3000/api/calls?type=pre_order', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log('Parsed type:', typeof parsed, Array.isArray(parsed) ? `Array length: ${parsed.length}` : Object.keys(parsed));
    } catch (e) {
      console.log('Error parsing response:', e.message, data.slice(0, 100));
    }
  });
}).on('error', err => console.log('HTTP Error:', err.message));
