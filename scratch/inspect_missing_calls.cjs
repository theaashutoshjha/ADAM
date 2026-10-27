const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
db.exec('PRAGMA busy_timeout = 60000; PRAGMA journal_mode = WAL;');

const calls = db.prepare('SELECT * FROM calls WHERE id IN (31, 158, 218)').all();
console.log('Sample missing calls:');
for (const c of calls) {
  console.log(`Call ID: ${c.id}, Customer Number: ${c.customer_number}, Calling Number: ${c.calling_number}, Date: ${c.call_date}, Time: ${c.call_time}, Transcript: "${c.transcript}"`);
}
