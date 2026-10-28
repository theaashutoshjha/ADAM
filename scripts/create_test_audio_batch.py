#!/usr/bin/env python3
"""
Generates 5 synthetic test WAV audio files in ./data/test_run_1 to run the
Step-by-Step Validation Test:
  python batch_audit.py --batch-dir ./data/test_run_1 --batch-id test_001 --desk-lang ta
"""

import math
import struct
import wave
from pathlib import Path


def generate_sine_wave(freq_hz: float, duration_sec: float, sample_rate: int = 16000, channels: int = 1) -> bytes:
    total_samples = int(sample_rate * duration_sec)
    raw_bytes = bytearray()
    for i in range(total_samples):
        # 440Hz / 880Hz audio tone with soft volume
        t = i / float(sample_rate)
        sample_val = int(16000 * math.sin(2.0 * math.pi * freq_hz * t))
        packed = struct.pack("<h", sample_val)
        for _ in range(channels):
            raw_bytes.extend(packed)
    return bytes(raw_bytes)


def create_test_wav(filepath: Path, duration_sec: float = 8.0, channels: int = 1, freq: float = 440.0):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16000
    with wave.open(str(filepath), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        audio_data = generate_sine_wave(freq, duration_sec, sample_rate, channels)
        wf.writeframes(audio_data)


def main():
    target_dir = Path("./data/test_run_1")
    target_dir.mkdir(parents=True, exist_ok=True)

    calls = [
        ("call_001_tamil_nifty_buy.wav", 12.0, 2, 440.0),    # Stereo (multichannel)
        ("call_002_tanglish_banknifty_pe.wav", 15.0, 1, 520.0),
        ("call_003_tamil_reliance_eq.wav", 10.0, 2, 440.0),  # Stereo
        ("call_004_query_non_trading.wav", 8.0, 1, 380.0),
        ("call_005_voicemail_cutoff.wav", 5.0, 1, 300.0),
    ]

    print(f"Generating 5 test call audio recordings in {target_dir}...")
    for filename, dur, ch, freq in calls:
        fpath = target_dir / filename
        create_test_wav(fpath, duration_sec=dur, channels=ch, freq=freq)
        print(f"  [OK] Created {filename} ({dur}s, {ch}-channel, 16kHz PCM WAV)")

    print("\nTest batch ready. You can now execute:")
    print("  python batch_audit.py --batch-dir ./data/test_run_1 --batch-id test_001 --desk-lang ta")


if __name__ == "__main__":
    main()
