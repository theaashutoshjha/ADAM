const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='scorecards'").get()?.sql;
console.log('Scorecards SQL:', tableSql);

const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='scorecards'").all();
console.log('Scorecards indexes:', indexes);
