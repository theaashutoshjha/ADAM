const fs = require('fs');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('.data/auditeq_production.db');

const tradesInDb = db.prepare('SELECT count(*) as count FROM trades').get().count;
console.log('Trades in DB:', tradesInDb);

// Check distinct trades in TRADE.csv
async function analyzeTradeCsv() {
  const stream = fs.createReadStream('.data/uploads/1792396024091_TRADE.csv');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  const clients = new Set();
  const numbers = new Set();
  const dates = new Set();
  const statuses = new Set();
  for await (const line of rl) {
    if (count === 0) { count++; continue; }
    const parts = line.split(',');
    // Dealer id,Advisorname,Date,Time,Client code,Number,Status,Symbol,B/S,Q,P
    if (parts.length >= 10) {
      dates.add(parts[2]);
      clients.add(parts[4]);
      numbers.add(parts[5]);
      statuses.add(parts[6]);
    }
    count++;
  }
  console.log('TRADE.csv total lines:', count - 1);
  console.log('Distinct dates:', Array.from(dates));
  console.log('Distinct clients:', clients.size);
  console.log('Distinct numbers:', numbers.size);
  console.log('Distinct statuses:', Array.from(statuses));
}

analyzeTradeCsv().catch(console.error);
