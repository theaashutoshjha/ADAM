const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('.data/auditeq_production.db');
const uploadsDir = path.resolve('.data/uploads');
const extDir = 'D:\\call_downloader\\downloaded_recordings';

const extFiles = fs.readdirSync(extDir).filter(f => f.endsWith('.mp3'));
console.log('Ext files count:', extFiles.length);

let newFiles = 0;
let matchedInDb = 0;

for (const f of extFiles) {
  const destPath = path.join(uploadsDir, f);
  const existsInUploads = fs.existsSync(destPath);
  
  // Check if filename matches a call in calls table
  const baseName = f.replace('.mp3', '');
  const call = db.prepare("SELECT id, caller_id, storage_path, transcript FROM calls WHERE recording_name LIKE ? OR original_filename LIKE ? OR caller_id LIKE ?").get(`%${baseName}%`, `%${baseName}%`, `%${baseName}%`);
  
  if (call) matchedInDb++;
  if (!existsInUploads) newFiles++;
}

console.log({ totalExt: extFiles.length, newFilesNotInUploads: newFiles, matchedInDb });
