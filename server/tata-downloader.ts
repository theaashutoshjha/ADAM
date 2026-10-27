import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { downloadCloudAudio } from './audioDownloader';
import { correlatePreOrdersWithCalls } from './pipeline/preOrderClusterEngine';

export interface DownloadProgress {
  isDownloading: boolean;
  total: number;
  completed: number;
  failed: number;
  currentCallId?: string;
  errors: Array<{ callId: string; error: string }>;
  lastUpdated: string;
}

class TataAutoDownloader {
  private progress: DownloadProgress = {
    isDownloading: false,
    total: 0,
    completed: 0,
    failed: 0,
    errors: [],
    lastUpdated: new Date().toISOString(),
  };

  private isCancelled = false;

  public getProgress(): DownloadProgress {
    return { ...this.progress };
  }

  /**
   * Starts downloading all audio calls from TataTele Smartflo cloudphone links (Column Y)
   */
  public async startAutoDownload(db: DatabaseSync): Promise<DownloadProgress> {
    if (this.progress.isDownloading) {
      console.log('[TataDownloader] Auto-download already in progress.');
      return this.getProgress();
    }

    this.isCancelled = false;
    this.progress = {
      isDownloading: true,
      total: 0,
      completed: 0,
      failed: 0,
      errors: [],
      lastUpdated: new Date().toISOString(),
    };

    // Find all calls with a recording_url where physical file is missing
    const pendingCalls = db.prepare(`
      SELECT id, canonical_call_id, caller_id, original_filename, recording_url, storage_path
      FROM calls
      WHERE recording_url IS NOT NULL 
        AND length(trim(recording_url)) > 8
        AND (recording_url LIKE 'http://%' OR recording_url LIKE 'https://%')
      ORDER BY id ASC
    `).all() as unknown as Array<{
      id: number;
      canonical_call_id?: string;
      caller_id?: string;
      original_filename?: string;
      recording_url: string;
      storage_path?: string;
    }>;

    const toDownload = pendingCalls.filter((c) => {
      if (!c.storage_path || c.storage_path.trim() === '') return true;
      return !fs.existsSync(c.storage_path);
    });

    this.progress.total = toDownload.length;
    console.log(`[TataDownloader] Found ${toDownload.length} call recordings to download from TataTele Column Y.`);

    if (toDownload.length === 0) {
      this.progress.isDownloading = false;
      this.progress.lastUpdated = new Date().toISOString();
      return this.getProgress();
    }

    // Run asynchronous download loop in background with concurrency of 2
    (async () => {
      const concurrency = 2;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < toDownload.length && !this.isCancelled) {
          const idx = currentIndex++;
          const call = toDownload[idx];
          const callIdentifier = call.canonical_call_id || call.caller_id || call.original_filename || `call_${call.id}`;

          this.progress.currentCallId = callIdentifier;
          this.progress.lastUpdated = new Date().toISOString();

          try {
            console.log(`[TataDownloader] [${idx + 1}/${toDownload.length}] Downloading recording for Call #${call.id} (${callIdentifier})...`);
            const localPath = await downloadCloudAudio(call.recording_url, callIdentifier);

            if (fs.existsSync(localPath)) {
              const stat = fs.statSync(localPath);
              db.prepare(`
                UPDATE calls SET
                  storage_path = ?,
                  file_size = ?,
                  status = CASE WHEN status = 'pending' THEN 'downloaded' ELSE status END,
                  updated_at = datetime('now')
                WHERE id = ?
              `).run(localPath, stat.size, call.id);

              this.progress.completed++;
            } else {
              throw new Error('Downloaded file not found on disk after fetch');
            }
          } catch (err: any) {
            console.error(`[TataDownloader] Failed to download Call #${call.id}:`, err?.message);
            this.progress.failed++;
            this.progress.errors.push({
              callId: callIdentifier,
              error: err?.message || 'Download failed',
            });
          }

          this.progress.lastUpdated = new Date().toISOString();
        }
      };

      try {
        const workers = Array.from({ length: concurrency }, () => worker());
        await Promise.all(workers);
      } finally {
        this.progress.isDownloading = false;
        this.progress.currentCallId = undefined;
        this.progress.lastUpdated = new Date().toISOString();
        console.log(`[TataDownloader] Completed downloading: ${this.progress.completed} downloaded, ${this.progress.failed} failed.`);
        if (this.progress.completed > 0) {
          try {
            console.log('[TataDownloader] Re-evaluating 10-Minute Pre-Order Correlation on newly downloaded audio recordings...');
            correlatePreOrdersWithCalls(db);
          } catch (corrErr: any) {
            console.error('[TataDownloader] Error correlating pre-orders after download:', corrErr?.message);
          }
        }
      }
    })();

    return this.getProgress();
  }

  public cancel(): void {
    this.isCancelled = true;
    this.progress.isDownloading = false;
  }
}

export const tataAutoDownloader = new TataAutoDownloader();
