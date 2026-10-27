import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { toRelativeStoragePath } from '../server/storage-path-resolver.ts';

const db = new DatabaseSync(path.join(process.cwd(), '.data', 'auditeq_production.db'));

const calls = db.prepare(`
  SELECT id, storage_path, recording_name FROM calls WHERE storage_path IS NOT NULL AND storage_path != ''
`).all() as any[];

console.log(`Found ${calls.length} calls with storage_path in database.`);

let updatedCount = 0;
let missingCount = 0;

db.exec('BEGIN TRANSACTION;');

const updateStmt = db.prepare('UPDATE calls SET storage_path = ? WHERE id = ?');

for (const c of calls) {
  const currentPath = c.storage_path;
  const relPath = toRelativeStoragePath(currentPath);

  // Check if exists
  const absCheck = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(absCheck) && !fs.existsSync(currentPath)) {
    missingCount++;
  }

  if (relPath !== currentPath) {
    updateStmt.run(relPath, c.id);
    updatedCount++;
  }
}

db.exec('COMMIT;');

console.log(`Successfully migrated ${updatedCount} storage paths to portable relative paths.`);
console.log(`Total verified on disk: ${calls.length - missingCount}/${calls.length}`);
