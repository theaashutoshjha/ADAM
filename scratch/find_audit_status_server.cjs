const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('audit_status') || l.includes('transcript_status')) {
    console.log(`${idx + 1}: ${l.trim().slice(0, 120)}`);
  }
});
