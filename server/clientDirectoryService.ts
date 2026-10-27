import fs from 'node:fs';
import path from 'node:path';
import { normalizePhoneNumber, normalizeClientCode } from './normalizer';

export interface ClientDirectoryEntry {
  client_code: string;
  phone_number: string;
  client_name?: string;
  advisor_name?: string;
}

const JSON_PATH = path.join(process.cwd(), 'config', 'client_directory.json');
const CSV_PATH = path.join(process.cwd(), 'config', 'client_directory.csv');

let memoryCache: ClientDirectoryEntry[] | null = null;
let lastMtime: number = 0;

export function loadClientDirectory(): ClientDirectoryEntry[] {
  try {
    if (fs.existsSync(JSON_PATH)) {
      const stats = fs.statSync(JSON_PATH);
      if (memoryCache && stats.mtimeMs === lastMtime) {
        return memoryCache;
      }
      const raw = fs.readFileSync(JSON_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryCache = parsed.map((item: any) => {
          const adv = item.advisor_name || item.advisor || (item.client_name && !/^W\d+$/i.test(item.client_name) ? item.client_name : '');
          return {
            client_code: normalizeClientCode(item.client_code || item.clientCode || item.code),
            phone_number: normalizePhoneNumber(item.phone_number || item.phone || item.mobile) || item.phone_number,
            client_name: item.client_name || item.name || '',
            advisor_name: adv || 'Kumarraja M',
          };
        }).filter(e => Boolean(e.client_code));
        lastMtime = stats.mtimeMs;
        return memoryCache;
      }
    } else if (fs.existsSync(CSV_PATH)) {
      const stats = fs.statSync(CSV_PATH);
      if (memoryCache && stats.mtimeMs === lastMtime) {
        return memoryCache;
      }
      const raw = fs.readFileSync(CSV_PATH, 'utf-8');
      const lines = raw.split('\n').filter(l => l.trim().length > 0);
      const entries: ClientDirectoryEntry[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        if (parts[0]) {
          const adv = parts[3] || (parts[2] && !/^W\d+$/i.test(parts[2]) ? parts[2] : '');
          entries.push({
            client_code: normalizeClientCode(parts[0]),
            phone_number: normalizePhoneNumber(parts[1]) || parts[1] || '',
            client_name: parts[2] || '',
            advisor_name: adv || 'Kumarraja M',
          });
        }
      }
      memoryCache = entries;
      lastMtime = stats.mtimeMs;
      return memoryCache;
    }
  } catch (err) {
    console.warn('[ClientDirectoryService] Failed to load directory file:', err);
  }
  return memoryCache || [];
}

export function lookupClientPhone(clientCode?: string | null): string | null {
  if (!clientCode) return null;
  const normCode = normalizeClientCode(clientCode);
  const directory = loadClientDirectory();
  const found = directory.find(c => c.client_code === normCode);
  return found?.phone_number || null;
}

export function lookupClientByPhone(phone?: string | null): ClientDirectoryEntry | null {
  if (!phone) return null;
  const normPhone = normalizePhoneNumber(phone);
  const directory = loadClientDirectory();
  return directory.find(c => normalizePhoneNumber(c.phone_number) === normPhone) || null;
}

export function saveClientDirectory(entries: ClientDirectoryEntry[]): boolean {
  try {
    const configDir = path.join(process.cwd(), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(JSON_PATH, JSON.stringify(entries, null, 2), 'utf-8');
    
    // Also sync CSV
    const csvLines = ['client_code,phone_number,client_name'];
    entries.forEach(e => {
      csvLines.push(`${e.client_code},${e.phone_number},${e.client_name || ''}`);
    });
    fs.writeFileSync(CSV_PATH, csvLines.join('\n'), 'utf-8');
    
    memoryCache = entries;
    lastMtime = fs.statSync(JSON_PATH).mtimeMs;
    return true;
  } catch (err) {
    console.error('[ClientDirectoryService] Error saving directory:', err);
    return false;
  }
}
