import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const prodDb = path.join(process.cwd(), '.data', 'auditeq_production.db');
const db = new DatabaseSync(prodDb);

const scNames = db.prepare("SELECT caller_name, count(*) as count FROM scorecards GROUP BY caller_name").all();
console.log('Scorecards caller_name group by:');
console.log(JSON.stringify(scNames, null, 2));

const callsNames = db.prepare("SELECT caller_name, count(*) as count FROM calls GROUP BY caller_name").all();
console.log('Calls caller_name group by:');
console.log(JSON.stringify(callsNames, null, 2));

const tradesNames = db.prepare("SELECT advisor_name, count(*) as count FROM trades GROUP BY advisor_name").all();
console.log('Trades advisor_name group by:');
console.log(JSON.stringify(tradesNames, null, 2));
