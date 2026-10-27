import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.data/auditeq_production.db');
const users = db.prepare("SELECT id, username, email, token, token_expires_at FROM users").all();
console.log('Users in DB:', users);
