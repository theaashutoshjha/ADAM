const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');
console.log(db.prepare("PRAGMA table_info(users)").all());
console.log(db.prepare("SELECT * FROM users").all());
