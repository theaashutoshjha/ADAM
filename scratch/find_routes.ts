import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes("apiRouter.get('/calls") || line.includes("apiRouter.get(\"/calls")) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
