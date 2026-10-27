import fs from 'node:fs';
import path from 'node:path';
import { validateSafeUrl } from './ssrf-validator';

/**
 * Downloads audio from Tata Teleservices Smartflo Cloudphone URL directly to local storage.
 * Strictly protected against SSRF, internal network scanning, and link-local metadata queries.
 */
export async function downloadCloudAudio(
  url: string,
  canonicalCallId: string,
  destDir?: string
): Promise<string> {
  const uploadDir = destDir || path.resolve('.data', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const safeFilename = `${canonicalCallId.replace(/[^a-zA-Z0-9._-]/g, '_')}.mp3`;
  const destPath = path.join(uploadDir, safeFilename);

  // If already downloaded and valid file exists, reuse it
  if (fs.existsSync(destPath)) {
    const stat = fs.statSync(destPath);
    if (stat.size > 1000) {
      return destPath;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90-second timeout for cloud decryption & streaming

  try {
    let currentUrl = url;
    let redirectsCount = 0;
    const maxRedirects = 5;

    while (redirectsCount <= maxRedirects) {
      // SSRF Protection Gate on EVERY hop
      const check = await validateSafeUrl(currentUrl);
      if (!check.isSafe) {
        throw new Error(`SSRF Blocked: Audio URL "${currentUrl}" failed security verification: ${check.error}`);
      }

      const res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual', // Strictly inspect redirects to prevent SSRF bypass
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*',
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          throw new Error(`Cloudphone redirect HTTP status ${res.status} missing Location header`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectsCount++;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Cloudphone returned HTTP status ${res.status} ${res.statusText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length < 100) {
        throw new Error(`Downloaded audio file is too small (${buffer.length} bytes)`);
      }

      fs.writeFileSync(destPath, buffer);
      return destPath;
    }

    throw new Error(`Audio download exceeded maximum redirect hops (${maxRedirects})`);
  } catch (err: any) {
    try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
    if (err.name === 'AbortError') {
      throw new Error('Audio download request timed out after 90s');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Looks up the Tata Smartflo cloud recording URL from metadata CSVs in .data/uploads
 */
export function lookupRecordingUrlForCall(
  canonicalCallId: string,
  callerId?: string
): string | null {
  const uploadsDir = path.resolve('.data', 'uploads');
  if (!fs.existsSync(uploadsDir)) return null;

  const files = fs.readdirSync(uploadsDir);
  const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv') && f.toLowerCase().includes('call-performance'));

  const targets = [
    canonicalCallId.toLowerCase(),
    (callerId || '').toLowerCase(),
  ].filter(Boolean);

  for (const csvFile of csvFiles) {
    try {
      const fullPath = path.join(uploadsDir, csvFile);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        for (const target of targets) {
          if (line.toLowerCase().includes(target)) {
            const match = line.match(/(https:\/\/cloudphone\.tatateleservices\.com[^\",\s]+)/);
            if (match) return match[1];
          }
        }
      }
    } catch {}
  }
  return null;
}
