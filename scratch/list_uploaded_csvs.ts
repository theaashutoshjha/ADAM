import fs from 'fs';

const files = fs.readdirSync('.data/uploads');
const csvs = files.filter(f => f.endsWith('.csv') || f.endsWith('.xlsx') || f.endsWith('.txt'));
console.log('Uploads CSVs:', csvs);

for (const c of csvs) {
  const head = fs.readFileSync(`.data/uploads/${c}`, 'utf8').slice(0, 300);
  console.log(`=== ${c} ===`);
  console.log(head.split('\n')[0]);
  console.log(head.split('\n')[1]);
}
