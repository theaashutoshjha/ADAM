// =============================================================
// Stage 1: IMPORT
// Handles file ingestion, batch creation (BATCH-YYYYMMDD-XXX),
// and assigns separate database Call IDs vs batch-scoped counts.
// =============================================================

import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { ImportBatchRecord } from './types';
import { normalizePhoneNumber, cleanCallerName } from '../normalizer';

import { evaluatePreOrderTradeCandidate } from './classification';

export interface UploadedFileInfo {
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  recording_url?: string;
  file_sha256?: string;
  caller_id?: string;
  calling_number?: string;
  customer_number?: string;
  registered_number?: string;
  client_code?: string;
  client_name?: string;
  advisor_name?: string;
  dealer?: string;
  call_date?: string;
  call_time?: string;
  duration_seconds?: number;
}

export interface BatchImportResult {
  batch_id: string;
  total_uploaded: number;
  start_call_id: number;
  end_call_id: number;
  calls: Array<{
    batch_index: number;
    call_id: number;
    original_filename: string;
    caller_id?: string;
    file_size: number;
    duration: number;
    import_status: string;
  }>;
}

/**
 * Generate a sequential batch ID for today: BATCH-YYYYMMDD-XXX
 */
export function generateBatchId(db: DatabaseSync): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // e.g. 20260907
  const prefix = `BATCH-${dateStr}-`;

  const latest = db
    .prepare(`SELECT batch_id FROM import_batches WHERE batch_id LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`) as { batch_id: string } | undefined;

  let nextSeq = 1;
  if (latest && latest.batch_id) {
    const parts = latest.batch_id.split('-');
    const seqPart = parseInt(parts[2], 10);
    if (!isNaN(seqPart)) {
      nextSeq = seqPart + 1;
    }
  }

  const seqFormatted = String(nextSeq).padStart(3, '0');
  return `${prefix}${seqFormatted}`;
}

import { ensureCallColumns } from './pipelineRunner';

/**
 * Stage 1 Entry Point: Ingest a list of uploaded audio files into a new batch
 */
export function stage1ImportCalls(
  db: DatabaseSync,
  files: UploadedFileInfo[]
): BatchImportResult {
  ensureCallColumns(db);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const batchId = generateBatchId(db);

  // 1. Insert the batch header
  db.prepare(`
    INSERT INTO import_batches (batch_id, total_files, uploaded_count, status, created_at)
    VALUES (?, ?, ?, 'completed', ?)
  `).run(batchId, files.length, files.length, now);

  const importedCalls: BatchImportResult['calls'] = [];
  let firstCallId = 0;
  let lastCallId = 0;

  const insertStmt = db.prepare(`
    INSERT INTO calls (
      canonical_call_id, batch_id, original_filename, recording_name, recording_url, storage_path, file_size, mime_type,
      file_sha256, caller_id, calling_number, phone_number, customer_number, registered_number,
      client, client_code, caller_name, dealer, advisor_name, dealer_name, call_date, call_time, duration_seconds,
      import_status, identity_status, transcript_status, classification,
      trade_match_status, matched_trade_id, audit_status, processing_status,
      source, status, call_type, classification_reason, scrap_reason, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'CONFIRMED', ?, 'PENDING', ?,
      ?, ?, 'PENDING', ?,
      'upload', ?, ?, ?, ?, ?, ?
    )
  `);

  const existingStmt = db.prepare(`
    SELECT id, canonical_call_id, caller_id, original_filename, storage_path, file_sha256, customer_number, client_code
    FROM calls 
    WHERE LOWER(canonical_call_id) = LOWER(?)
       OR LOWER(caller_id) = LOWER(?)
       OR LOWER(original_filename) = LOWER(?)
       OR LOWER(original_filename) = LOWER(?)
       OR (file_sha256 IS NOT NULL AND file_sha256 != '' AND file_sha256 = ?)
    LIMIT 1
  `);

  const mergeStmt = db.prepare(`
    UPDATE calls SET
      storage_path = COALESCE(NULLIF(storage_path, ''), ?),
      recording_url = COALESCE(NULLIF(recording_url, ''), ?),
      file_size = CASE WHEN file_size = 0 OR file_size IS NULL THEN ? ELSE file_size END,
      mime_type = COALESCE(NULLIF(mime_type, ''), ?),
      file_sha256 = COALESCE(NULLIF(file_sha256, ''), ?),
      customer_number = COALESCE(NULLIF(customer_number, ''), ?),
      calling_number = COALESCE(NULLIF(calling_number, ''), ?),
      phone_number = COALESCE(NULLIF(phone_number, ''), ?),
      registered_number = COALESCE(NULLIF(registered_number, ''), ?),
      client_code = COALESCE(NULLIF(client_code, 'UNVERIFIED'), ?),
      client = COALESCE(NULLIF(client, 'UNVERIFIED'), ?),
      call_date = COALESCE(NULLIF(call_date, ''), ?),
      call_time = COALESCE(NULLIF(call_time, ''), ?),
      duration_seconds = CASE WHEN duration_seconds = 0 OR duration_seconds IS NULL THEN ? ELSE duration_seconds END,
      updated_at = ?
    WHERE id = ?
  `);

  // Pre-compile client and trade lookup statements and maintain memory cache for instant resolution
  let clientStmt: ReturnType<DatabaseSync['prepare']> | null = null;
  try {
    clientStmt = db.prepare('SELECT phone_number, registered_mobile FROM clients WHERE client_code = ?');
  } catch {
    clientStmt = null;
  }

  let tradeStmt: ReturnType<DatabaseSync['prepare']> | null = null;
  try {
    tradeStmt = db.prepare('SELECT phone_number, client_number FROM trades WHERE client = ? AND (phone_number IS NOT NULL OR client_number IS NOT NULL) LIMIT 1');
  } catch {
    tradeStmt = null;
  }

  const clientRegCache = new Map<string, string>();

  // Use an explicit transaction: 1,000+ inserts complete in ~20ms instead of 20+ seconds!
  db.exec('BEGIN TRANSACTION;');
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      
      // 1. Authoritative Canonical Call ID: Filename without extension or Column C
      const rawBaseName = path.basename(file.original_filename);
      const baseNameNoExt = rawBaseName.replace(/^\d{13}_/, '').replace(/\.(?:wav|mp3|ogg|webm|m4a|aac|flac)$/i, '').trim();
      const canonicalCallId = String(file.caller_id || baseNameNoExt).trim();

      // Check if call already exists (strict exact match only)
      let existingCall = existingStmt.get(
        canonicalCallId,
        canonicalCallId,
        file.original_filename,
        `${canonicalCallId}.mp3`,
        file.file_sha256 || ''
      ) as any;

      if (existingCall) {
        console.log(`[DUPLICATE_INGESTION_SKIPPED] Call already exists with canonical_call_id "${canonicalCallId}" (Database ID #${existingCall.id}). Merging fields.`);
        mergeStmt.run(
          file.storage_path || null,
          file.recording_url || null,
          file.file_size || 0,
          file.mime_type || null,
          file.file_sha256 || null,
          file.customer_number || null,
          file.calling_number || file.customer_number || null,
          file.customer_number || null,
          file.registered_number || null,
          file.client_code || null,
          file.client_code || null,
          file.call_date || null,
          file.call_time || null,
          file.duration_seconds || 0,
          now,
          existingCall.id
        );

        importedCalls.push({
          batch_index: index + 1,
          call_id: existingCall.id,
          original_filename: file.original_filename,
          caller_id: canonicalCallId,
          file_size: file.file_size || 0,
          duration: file.duration_seconds || 0,
          import_status: 'DUPLICATE_INGESTION_SKIPPED',
        });
        continue;
      }

      // 2. Authoritative Customer Number: Normalized 10 digits
      const rawCustomer = String(file.customer_number || file.calling_number || '').trim();
      let customerNumber10 = '';
      if (rawCustomer) {
        customerNumber10 = normalizePhoneNumber(rawCustomer);
      }

      // Extract client code from filename or metadata first
      let extractedClientCode = file.client_code || '';
      if (!extractedClientCode) {
        const match = file.original_filename.match(/\b([A-Z]{2,4}[0-9]{3,7})\b/i);
        if (match) {
          extractedClientCode = match[1].toUpperCase();
        }
      }

      // Registered number must come from metadata or authoritative clients master
      let regNumber = normalizePhoneNumber(file.registered_number || '') || file.registered_number || '';
      if (!regNumber && extractedClientCode) {
        if (clientRegCache.has(extractedClientCode)) {
          regNumber = clientRegCache.get(extractedClientCode) || '';
        } else {
          if (clientStmt) {
            try {
              const clientRow = clientStmt.get(extractedClientCode) as any;
              if (clientRow) {
                regNumber = normalizePhoneNumber(clientRow.registered_mobile || clientRow.phone_number || '') || clientRow.phone_number || '';
              }
            } catch {}
          }
          if (!regNumber && tradeStmt) {
            try {
              const tradeRow = tradeStmt.get(extractedClientCode) as any;
              if (tradeRow) {
                regNumber = normalizePhoneNumber(tradeRow.phone_number || tradeRow.client_number || '') || tradeRow.client_number || tradeRow.phone_number || '';
              }
            } catch {}
          }
          clientRegCache.set(extractedClientCode, regNumber);
        }
      }

      const duration = file.duration_seconds || 0;
      const recordingName = file.storage_path ? path.basename(file.storage_path) : (file.original_filename || 'call_rec');
      const callDate = file.call_date || now.slice(0, 10);
      const callTime = file.call_time || now.slice(11, 19);

      // Evaluate Pre-Order Candidate Deterministically
      const preOrderCheck = evaluatePreOrderTradeCandidate(
        db,
        customerNumber10,
        callTime,
        callDate,
        file.advisor_name || file.dealer
      );

      let classification = 'PENDING';
      let callType = 'regular';
      let tradeMatchStatus = 'PENDING';
      let matchedTradeId: number | null = null;
      let identityStatus = 'PENDING';
      let processingStatus = 'IDLE';
      let callStatus = 'imported';
      let classificationReason: string | null = null;
      let scrapReason: string | null = null;

      if (preOrderCheck.isCandidate && preOrderCheck.matchedTradeRecord) {
        classification = 'PRE_ORDER';
        callType = 'pre_order';
        tradeMatchStatus = 'CONFIRMED';
        matchedTradeId = preOrderCheck.matchedTradeRecord.id;
        identityStatus = 'RESOLVED';
        const isShortCall = duration > 0 && duration < 6;
        classificationReason = preOrderCheck.reason + (isShortCall ? ' [Short call <6s]' : '');
        if (isShortCall) {
          scrapReason = `Short duration pre-order call (${duration}s < 6s)`;
          callStatus = 'pre_order';
          processingStatus = 'COMPLETED';
        }
        if (preOrderCheck.matchedTradeRecord.client) {
          extractedClientCode = preOrderCheck.matchedTradeRecord.client;
        }
      } else if (duration > 0 && duration < 6) {
        classification = 'SCRAP';
        callType = 'scrap';
        callStatus = 'scrap';
        processingStatus = 'COMPLETED';
        scrapReason = `Duration < 6s regulatory scrap threshold (${duration}s)`;
        classificationReason = `Call duration (${duration}s) is under 6 seconds and did not match any trade.`;
      }

      const res = insertStmt.run(
        canonicalCallId,
        batchId,
        file.original_filename,
        recordingName,
        file.recording_url || null,
        file.storage_path,
        file.file_size,
        file.mime_type,
        file.file_sha256 || '',
        canonicalCallId,
        customerNumber10,
        customerNumber10,
        customerNumber10,
        regNumber,
        extractedClientCode,
        extractedClientCode,
        cleanCallerName(file.advisor_name || ''),
        cleanCallerName(file.dealer || ''),
        cleanCallerName(file.advisor_name || ''),
        cleanCallerName(file.dealer || file.advisor_name || ''),
        callDate,
        callTime,
        duration,
        identityStatus,
        classification,
        tradeMatchStatus,
        matchedTradeId,
        processingStatus,
        callStatus,
        callType,
        classificationReason,
        scrapReason,
        now,
        now
      );

      const callId = Number(res.lastInsertRowid);
      if (index === 0) firstCallId = callId;
      lastCallId = callId;

      importedCalls.push({
        batch_index: index + 1,
        call_id: callId,
        original_filename: file.original_filename,
        caller_id: canonicalCallId,
        file_size: file.file_size,
        duration,
        import_status: 'CONFIRMED',
      });
    }
    db.exec('COMMIT;');
  } catch (txErr) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw txErr;
  }

  return {
    batch_id: batchId,
    total_uploaded: files.length,
    start_call_id: firstCallId,
    end_call_id: lastCallId,
    calls: importedCalls,
  };
}
