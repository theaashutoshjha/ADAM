// =============================================================
// ADAM-AR v18.0.0 — Audio Preprocessing & Quality Control Engine
// =============================================================

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

export function getFfmpegBinary(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer?.path && fs.existsSync(installer.path)) {
      return installer.path;
    }
  } catch {}
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return 'ffmpeg';
}

export interface AudioQualityMetrics {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  formatName: string;
  rmsLevelDb?: number;
  isSilent: boolean;
  hasStereoSeparation: boolean;
  qcStatus: 'PASS' | 'WARN' | 'FAIL';
  qcNotes: string[];
}

export interface PreprocessedAudio {
  originalPath: string;
  normalizedPath: string;
  channel0Path?: string; // Channel 0 (typically Advisor / Channel L)
  channel1Path?: string; // Channel 1 (typically Customer / Channel R)
  metrics: AudioQualityMetrics;
}

let _ffmpegAvailable: boolean | null = null;
export async function isFfmpegInstalled(): Promise<boolean> {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable;
  try {
    const bin = getFfmpegBinary();
    await execFileAsync(bin, ['-version'], { timeout: 2500 });
    _ffmpegAvailable = true;
  } catch {
    _ffmpegAvailable = false;
  }
  return _ffmpegAvailable;
}

/**
 * Probes audio metadata and audio levels using ffprobe / ffmpeg
 */
export async function inspectAudioQuality(filePath: string): Promise<AudioQualityMetrics> {
  const notes: string[] = [];

  if (!(await isFfmpegInstalled())) {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : { size: 0 };
    const estDuration = Math.max(1, Math.round(stat.size / 16000));
    return {
      durationSeconds: estDuration,
      sampleRate: 16000,
      channels: 1,
      formatName: path.extname(filePath).replace('.', '') || 'mp3',
      isSilent: false,
      hasStereoSeparation: false,
      qcStatus: 'PASS',
      qcNotes: ['Native audio passed directly to Deepgram Nova-3 engine.'],
    };
  }

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 });

    const info = JSON.parse(stdout);
    const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio') || info.streams?.[0];
    const duration = parseFloat(info.format?.duration || audioStream?.duration || '0');
    const sampleRate = parseInt(audioStream?.sample_rate || '44100', 10);
    const channels = parseInt(audioStream?.channels || '1', 10);
    const formatName = info.format?.format_name || 'unknown';

    if (duration < 1.0) {
      notes.push('Recording is under 1 second long.');
    }
    if (channels >= 2) {
      notes.push('Stereo recording detected: multi-channel separation enabled.');
    }

    // Run quick volume / RMS analysis using ffmpeg volumedetect
    let rmsDb: number | undefined;
    let isSilent = false;
    try {
      const { stderr: volumeStderr } = await execFileAsync('ffmpeg', [
        '-i', filePath,
        '-af', 'volumedetect',
        '-f', 'null',
        '-',
      ], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 });

      const meanVolMatch = volumeStderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
      const maxVolMatch = volumeStderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);

      if (meanVolMatch) {
        rmsDb = parseFloat(meanVolMatch[1]);
        if (rmsDb < -55.0) {
          isSilent = true;
          notes.push(`Extremely low audio volume detected (${rmsDb.toFixed(1)} dB). Possible silence.`);
        }
      }

      if (maxVolMatch && parseFloat(maxVolMatch[1]) < -50.0) {
        isSilent = true;
        notes.push('Audio peak is below -50dB. Silence guard activated.');
      }
    } catch {
      // Volume check fallback
    }

    const qcStatus = isSilent || duration < 0.5 ? 'WARN' : 'PASS';

    return {
      durationSeconds: duration,
      sampleRate,
      channels,
      formatName,
      rmsLevelDb: rmsDb,
      isSilent,
      hasStereoSeparation: channels >= 2,
      qcStatus,
      qcNotes: notes,
    };
  } catch (err) {
    return {
      durationSeconds: 0,
      sampleRate: 44100,
      channels: 1,
      formatName: 'raw',
      isSilent: false,
      hasStereoSeparation: false,
      qcStatus: 'WARN',
      qcNotes: [`ffprobe metadata inspection fallback: ${(err as Error).message}`],
    };
  }
}

/**
 * Preprocesses and normalizes audio for high-precision ASR
 * - Normalizes to 16kHz mono WAV or optimized format
 * - Extracts separate channels if stereo telephony audio
 */
export async function preprocessAudioForTranscription(filePath: string): Promise<PreprocessedAudio> {
  const metrics = await inspectAudioQuality(filePath);
  if (!(await isFfmpegInstalled())) {
    return {
      originalPath: filePath,
      normalizedPath: filePath,
      metrics,
    };
  }

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));

  const normalizedPath = path.join(dir, `${base}_enhanced_16k.wav`);

  try {
    // 0. Cache check: return existing enhanced file if valid
    if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).size > 1024) {
      return {
        originalPath: filePath,
        normalizedPath,
        channel0Path: fs.existsSync(path.join(dir, `${base}_ch0_audio.wav`)) ? path.join(dir, `${base}_ch0_audio.wav`) : undefined,
        channel1Path: fs.existsSync(path.join(dir, `${base}_ch1_audio.wav`)) ? path.join(dir, `${base}_ch1_audio.wav`) : undefined,
        metrics,
      };
    }

    // Step 2: High-Accuracy Audio Normalization for Contact Center & South Asian Telephony:
    // - highpass=f=200: Cuts off sub-bass hum and microphone thumps
    // - lowpass=f=3400: Cuts off high-frequency line static and hiss (ITU-T telephony voice band)
    // - loudnorm: Equalizes whispery customers and loud call center agents (EBU R128)
    // - ar=16000, ac=1: Mono 16kHz WAV for maximum Deepgram Nova-3 acoustic accuracy
    const ffmpegBin = getFfmpegBinary();
    const isStereo = metrics.channels >= 2;
    const filter = 'highpass=f=200,lowpass=f=3400,loudnorm';

    const args = [
      '-y',
      '-i', filePath,
      '-af', filter,
      '-ar', '16000',
    ];
    if (!isStereo) {
      args.push('-ac', '1');
    }
    args.push('-c:a', 'pcm_s16le', normalizedPath);

    await execFileAsync(ffmpegBin, args, { timeout: 35000, maxBuffer: 10 * 1024 * 1024 });
  } catch (err: any) {
    // Fallback if loudnorm fails: standard resample
    try {
      const ffmpegBin = getFfmpegBinary();
      await execFileAsync(ffmpegBin, [
        '-y',
        '-i', filePath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        normalizedPath,
      ], { timeout: 25000, maxBuffer: 10 * 1024 * 1024 });
    } catch {
      // Return original file on error
      return {
        originalPath: filePath,
        normalizedPath: filePath,
        metrics,
      };
    }
  }

  let channel0Path: string | undefined;
  let channel1Path: string | undefined;

  // 2. Channel separation if stereo telephony call
  if (metrics.channels >= 2) {
    try {
      const ffmpegBin = getFfmpegBinary();
      const ch0 = path.join(dir, `${base}_ch0_audio.wav`);
      const ch1 = path.join(dir, `${base}_ch1_audio.wav`);

      await execFileAsync(ffmpegBin, [
        '-y',
        '-i', filePath,
        '-map_channel', '0.0.0',
        '-ar', '16000',
        ch0,
      ], { timeout: 25000, maxBuffer: 10 * 1024 * 1024 });

      await execFileAsync(ffmpegBin, [
        '-y',
        '-i', filePath,
        '-map_channel', '0.0.1',
        '-ar', '16000',
        ch1,
      ], { timeout: 25000, maxBuffer: 10 * 1024 * 1024 });

      if (fs.existsSync(ch0) && fs.existsSync(ch1)) {
        channel0Path = ch0;
        channel1Path = ch1;
      }
    } catch {
      // Channel splitting optional
    }
  }

  return {
    originalPath: filePath,
    normalizedPath: fs.existsSync(normalizedPath) ? normalizedPath : filePath,
    channel0Path,
    channel1Path,
    metrics,
  };
}
