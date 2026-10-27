const fs = require('fs');

const lines = fs.readFileSync('.data/uploads/1792396031777_Call-Performance-Report_01-10-2026_18-10-2026_1792343086487.csv', 'utf8').trim().split('\n');
const header = lines[0].split(',');
console.log('Columns:');
header.forEach((h, i) => console.log(i, h));

const statuses = {};
const directions = {};
let answered = 0;
let convDurGt0 = 0;
let withRec = 0;

for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split(',');
  statuses[p[1]] = (statuses[p[1]] || 0) + 1;
  directions[p[0]] = (directions[p[0]] || 0) + 1;
  if (p[1] === 'Answered') answered++;
  const convDur = parseInt(p[19], 10) || 0;
  if (convDur > 0) convDurGt0++;
  if (p[24] && p[24].trim()) withRec++;
}

console.log({ total: lines.length - 1, statuses, directions, answered, convDurGt0, withRec });
