#!/usr/bin/env python3
"""
========================================================================================
AuditEQ / ADAM-AR: Production Audio Transcription & Dynamic Order Extraction Pipeline
========================================================================================
Addresses all root causes for Indian Equity Dealing Room Call Auditing:
1. Acoustic Chopping: Nova-3 utterance_end_ms=2500, vad_events=false
2. Codec Degradation: Automated FFmpeg upsampling/conversion to 16 kHz 16-bit PCM WAV
3. Crosstalk & Overlapping Voices: Retains 2-channel stereo PBX (multichannel=true)
4. Language Misclassification: detect_language=false with explicit language routing (ta, hi, en-IN)
5. Smart Formatting Conflicts: smart_format=false, punctuate=false (raw token stream preserved)
6. Nova-3 Keyterm Prompting: URL-encoded keyterm parameters for equities, indices, and derivatives
7. High-Concurrency Asynchronous Engine: asyncio + aiohttp + Semaphore(10) with exponential backoff
8. LLM Trade Reconstruction & Confidence Auditing Layer: Phonetic correction, regional number parsing,
   and word-level confidence thresholding (<0.60 -> MANUAL_REVIEW_REQUIRED)
9. Dynamic Traceable Auditing: Atomic SHA-256 file hashing, raw transcript archiving,
   traceable evidence linking, and zero mock/dummy data (SQL-aggregated reporting only).
10. Critical Protections:
    - Dedicated single-writer async DB queue to eliminate SQLite write lock contention.
    - Rate limit backoff with Retry-After header and jitter for HTTP 429.
    - Pre-filter gate to bypass LLM on non-trade calls, preventing token inflation.
========================================================================================
"""

import argparse
import asyncio
import csv
import datetime
import hashlib
import json
import logging
import os
import random
import re
import shutil
import sqlite3
import subprocess
import sys
import traceback
import urllib.parse
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import aiohttp

# Optional dotenv support
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ========================================================================================
# LOGGING CONFIGURATION
# ========================================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("batch_audit")


# ========================================================================================
# CONSTANTS & CONFIGURATION
# ========================================================================================
DEEPGRAM_ENDPOINT = "https://api.deepgram.com/v1/listen"
OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"

DEFAULT_KEYTERMS = [
    # Indices & Major Equities
    "Nifty", "BankNifty", "FinNifty", "Sensex", "MidcpNifty",
    "Reliance", "HDFC", "TCS", "Infy",
    # Derivative & Order Syntax
    "CE", "PE", "call", "put", "strike price", "lot size",
    "stoploss", "target", "intraday", "expiry", "rollover",
    "OTM", "ITM", "ATM", "market order", "limit order",
    # Pre-Order Client Code prefixes & Desk terms
    "client code", "UCC", "CMP", "current market price",
    "WIA", "WIC", "WID", "WIE", "WIF", "WIG", "FIA", "PWA", "PWD",
    # Indic Action & Number Cues
    "rendayiram", "pathayiram", "do lakh", "ek lakh", "pachas", "do sau",
    "vaangunga", "vithudunga", "kar do", "kharid lo", "bech do"
]

SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".gsm"}

# Comprehensive Fast Pre-Filter Pattern for Indian Equity Trading Intent
TRADE_KEYWORD_PATTERN = re.compile(
    r"\b(?:"
    r"nifty|banknifty|finnifty|sensex|midcp|midcap|reliance|hdfc|tcs|infy|bhel|bel|sbin|icici|itc|lt|tata|"
    r"ce|pe|call|put|strike|option|options|future|futures|fut|lot|lots|share|shares|qty|quantity|"
    r"buy|sell|kharid|bech|vaang|vaanga|virka|vithu|podu|le\s*lo|kar\s*do|punch|order|"
    r"cmp|market|limit|stoploss|target|intraday|delivery|expiry|rollover|demat|"
    r"lakh|crore|hazaar|sau|rendayiram|pathayiram|pachas|do\s*sau|ek\s*lakh|bhav|rate"
    r")\b",
    re.IGNORECASE
)

VOICEMAIL_PATTERN = re.compile(
    r"\b(?:"
    r"voicemail|voice\s*mail|not\s+available|leave\s+a\s+message|record\s+your\s+message|"
    r"forwarded\s+to|at\s+the\s+tone|mailbox\s+is\s+full|please\s+try\s+later"
    r")\b",
    re.IGNORECASE
)


# ========================================================================================
# DATABASE INITIALIZATION (SQLite / Production Compatible)
# ========================================================================================
def init_db(db_path: Path) -> sqlite3.Connection:
    """
    Initializes the database schema ensuring atomic file tracking and evidence linking.
    Sets timeout=120.0 and WAL pragmas to prevent lock contention.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=120.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    
    with conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 60000;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        
        # 1. Atomic call tracking
        conn.execute("""
            CREATE TABLE IF NOT EXISTS call_records (
                file_hash TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                duration_seconds REAL NOT NULL DEFAULT 0.0,
                channels INTEGER NOT NULL DEFAULT 1,
                sample_rate INTEGER NOT NULL DEFAULT 16000,
                desk_language TEXT NOT NULL DEFAULT 'en-IN',
                batch_id TEXT NOT NULL DEFAULT 'default_batch',
                upload_timestamp TEXT NOT NULL,
                processing_status TEXT NOT NULL DEFAULT 'QUEUED',
                error_code TEXT,
                error_stack TEXT,
                raw_storage_path TEXT,
                updated_at TEXT NOT NULL
            );
        """)

        # 2. Raw Deepgram Transcripts
        conn.execute("""
            CREATE TABLE IF NOT EXISTS raw_transcripts (
                file_hash TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                transcript_text TEXT NOT NULL,
                raw_json TEXT NOT NULL,
                average_confidence REAL DEFAULT 0.0,
                word_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (file_hash) REFERENCES call_records(file_hash) ON DELETE CASCADE
            );
        """)

        # 3. Traceable Trades with Evidence Linking
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_hash TEXT NOT NULL,
                file_name TEXT NOT NULL,
                trade_detected INTEGER NOT NULL DEFAULT 1,
                ticker TEXT,
                instrument TEXT,
                strike_price REAL,
                action TEXT,
                quantity INTEGER,
                order_type TEXT,
                confidence_flag TEXT NOT NULL DEFAULT 'PASSED',
                evidence_start_time REAL,
                evidence_end_time REAL,
                raw_sentence TEXT,
                confidence_score REAL,
                raw_summary TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (file_hash) REFERENCES call_records(file_hash) ON DELETE CASCADE
            );
        """)
        
        # Indexes for high performance
        conn.execute("CREATE INDEX IF NOT EXISTS idx_call_records_status ON call_records(processing_status);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_call_records_batch ON call_records(batch_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_hash ON trades(file_hash);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_flag ON trades(confidence_flag);")
    
    return conn


# ========================================================================================
# AUDIO INSPECTION & PREPROCESSING (FFmpeg Worker)
# ========================================================================================
class AudioPreprocessor:
    def __init__(self, ffmpeg_bin: Optional[str] = None, ffprobe_bin: Optional[str] = None):
        self.ffmpeg_bin = ffmpeg_bin or shutil.which("ffmpeg") or "ffmpeg"
        self.ffprobe_bin = ffprobe_bin or shutil.which("ffprobe") or "ffprobe"
        self._has_ffmpeg = self._test_binary(self.ffmpeg_bin)
        self._has_ffprobe = self._test_binary(self.ffprobe_bin)

    @staticmethod
    def _test_binary(bin_path: str) -> bool:
        try:
            res = subprocess.run([bin_path, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return res.returncode == 0
        except Exception:
            return False

    def probe_audio(self, audio_path: Path) -> Tuple[int, int, float]:
        """
        Returns (channels, sample_rate, duration_seconds).
        Uses ffprobe if available, otherwise inspects standard WAV header if applicable.
        """
        if self._has_ffprobe:
            try:
                cmd = [
                    self.ffprobe_bin,
                    "-v", "error",
                    "-show_entries", "stream=channels,sample_rate,duration",
                    "-of", "json",
                    str(audio_path)
                ]
                proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
                info = json.loads(proc.stdout)
                streams = info.get("streams", [])
                if streams:
                    s = streams[0]
                    channels = int(s.get("channels", 1))
                    sample_rate = int(s.get("sample_rate", 16000))
                    duration = float(s.get("duration", 0.0) or 0.0)
                    return channels, sample_rate, duration
            except Exception as e:
                logger.debug(f"ffprobe probe failed on {audio_path.name}: {e}. Falling back to wave parser.")

        # Fallback: standard Python wave inspection for .wav files
        if audio_path.suffix.lower() == ".wav":
            try:
                with wave.open(str(audio_path), "rb") as wf:
                    channels = wf.getnchannels()
                    rate = wf.getframerate()
                    frames = wf.getnframes()
                    duration = frames / float(rate) if rate > 0 else 0.0
                    return channels, rate, duration
            except Exception:
                pass

        # Estimate duration by file size assuming 16kHz 16-bit mono
        size = audio_path.stat().st_size
        est_duration = size / (16000 * 2) if size > 0 else 0.0
        return 1, 16000, est_duration

    def preprocess(self, input_path: Path, output_dir: Path) -> Tuple[Path, int, int, float, bool]:
        """
        Phase A Implementation:
        - If stereo (2 channels: Dealer on left, Client on right): Retains stereo channels and flags multichannel=true.
        - If mono: Normalizes and converts to 16 kHz 16-bit Linear PCM WAV:
          `ffmpeg -i input.wav -ar 16000 -c:a pcm_s16le preprocessed.wav`
        Returns: (preprocessed_path, channels, sample_rate, duration_seconds, is_multichannel)
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        channels, sample_rate, duration = self.probe_audio(input_path)
        is_stereo = (channels >= 2)
        out_path = output_dir / f"prep_{input_path.stem}.wav"

        # If FFmpeg is available, perform automated normalization
        if self._has_ffmpeg:
            try:
                if is_stereo:
                    # Retain stereo channels, normalize to 16kHz PCM 16-bit
                    cmd = [
                        self.ffmpeg_bin, "-y",
                        "-i", str(input_path),
                        "-ar", "16000",
                        "-c:a", "pcm_s16le",
                        str(out_path)
                    ]
                else:
                    # Mono 16kHz PCM 16-bit
                    cmd = [
                        self.ffmpeg_bin, "-y",
                        "-i", str(input_path),
                        "-ac", "1",
                        "-ar", "16000",
                        "-c:a", "pcm_s16le",
                        str(out_path)
                    ]
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
                
                # Re-probe preprocessed audio for authoritative values
                ch, sr, dur = self.probe_audio(out_path)
                return out_path, ch, sr, dur, is_stereo
            except subprocess.CalledProcessError as err:
                logger.warning(f"FFmpeg conversion failed: {err.stderr.decode('utf-8', 'ignore')}. Using original file.")

        # Fallback: if already a WAV or ffmpeg is not available, return input
        return input_path, channels, sample_rate, duration, is_stereo


# ========================================================================================
# DEEPGRAM NOVA-3 API CALLER (Asynchronous High-Concurrency)
# ========================================================================================
class DeepgramNova3Transcriber:
    def __init__(self, api_key: str, desk_language: str = "en-IN"):
        self.api_key = api_key
        self.desk_language = desk_language

    def build_request_url(self, is_multichannel: bool, desk_language: Optional[str] = None) -> str:
        """
        Phase B Configuration:
        Constructs the request URL with exact query parameters:
        - model=nova-3
        - utterance_end_ms=2500
        - vad_events=false
        - smart_format=false
        - punctuate=false
        - detect_language=false
        - multichannel=true (if stereo)
        - redact=pci & redact=ssn
        - language routing (ta, hi, en-IN)
        - URL-encoded keyterm parameters
        """
        lang = desk_language or self.desk_language
        # Explicit Language Routing based on branch/desk metadata
        if lang in {"ta", "tamil"}:
            resolved_lang = "ta"
        elif lang in {"hi", "hindi"}:
            resolved_lang = "hi"
        else:
            resolved_lang = "en-IN"

        params: List[Tuple[str, str]] = [
            ("model", "nova-3"),
            ("utterance_end_ms", "2500"),
            ("vad_events", "false"),
            ("smart_format", "false"),
            ("punctuate", "false"),
            ("detect_language", "false"),
            ("language", resolved_lang),
            ("redact", "pci"),
            ("redact", "ssn"),
        ]

        if is_multichannel:
            params.append(("multichannel", "true"))

        for kt in DEFAULT_KEYTERMS:
            params.append(("keyterm", kt))

        query_str = urllib.parse.urlencode(params)
        return f"{DEEPGRAM_ENDPOINT}?{query_str}"

    async def transcribe_file(
        self,
        session: aiohttp.ClientSession,
        audio_path: Path,
        is_multichannel: bool,
        desk_language: Optional[str] = None,
        max_retries: int = 8,
        base_delay: float = 2.0,
    ) -> Dict[str, Any]:
        """
        Calls Deepgram Nova-3 API with exponential backoff and jitter on HTTP 429 and 5xx.
        Checks Retry-After header to prevent exhausting rate limits.
        DOES NOT swallow exceptions or return fake mock fallbacks.
        """
        url = self.build_request_url(is_multichannel, desk_language)
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "audio/wav",
        }

        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        attempt = 0
        last_error = None

        while attempt < max_retries:
            attempt += 1
            try:
                async with session.post(url, headers=headers, data=audio_bytes, timeout=aiohttp.ClientTimeout(total=180)) as resp:
                    resp_text = await resp.text()

                    if resp.status == 200:
                        return json.loads(resp_text)

                    # Trap 2 Handling: Rate Limits (429) with Retry-After Header & Jitter
                    if resp.status == 429:
                        retry_after = resp.headers.get("Retry-After")
                        if retry_after:
                            try:
                                delay = float(retry_after) + random.uniform(0.5, 2.0)
                            except ValueError:
                                delay = min(60.0, (2.0 ** attempt) + random.uniform(1.0, 3.0))
                        else:
                            delay = min(60.0, (2.0 ** attempt) + random.uniform(1.0, 3.0))

                        logger.warning(
                            f"[Deepgram Rate Limited] HTTP 429 on {audio_path.name}. "
                            f"Throttling back: Sleeping {delay:.2f}s (Attempt {attempt}/{max_retries})..."
                        )
                        await asyncio.sleep(delay)
                        continue

                    # Server Errors (5xx)
                    if resp.status in (500, 502, 503, 504):
                        delay = min(45.0, base_delay * (2 ** (attempt - 1)) + random.uniform(0.5, 2.0))
                        logger.warning(
                            f"[Deepgram Server Error] HTTP {resp.status} on {audio_path.name}. "
                            f"Retry {attempt}/{max_retries} after {delay:.2f}s..."
                        )
                        await asyncio.sleep(delay)
                        continue

                    # Non-retryable HTTP client error (400, 401, 403, 402)
                    raise RuntimeError(f"Deepgram HTTP {resp.status} Error: {resp_text}")

            except (aiohttp.ClientError, asyncio.TimeoutError) as err:
                last_error = err
                delay = min(45.0, base_delay * (2 ** (attempt - 1)) + random.uniform(0.5, 2.0))
                logger.warning(
                    f"[Deepgram Network Error] {audio_path.name}: {err}. "
                    f"Retry {attempt}/{max_retries} after {delay:.2f}s..."
                )
                await asyncio.sleep(delay)

        # Max retries exhausted - raise exception explicitly to be recorded in DB & Dead Letter Queue
        raise RuntimeError(f"Deepgram transcription failed after {max_retries} attempts: {last_error}")


# ========================================================================================
# LLM TRADE RECONSTRUCTION & CONFIDENCE AUDITING LAYER
# ========================================================================================
class LLMTradeAuditor:
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model = model

    @staticmethod
    def extract_full_transcript_and_words(deepgram_json: Dict[str, Any]) -> Tuple[str, List[Dict[str, Any]], float]:
        """Extracts complete raw text, word stream with confidence scores, and average confidence."""
        channels = deepgram_json.get("results", {}).get("channels", [])
        if not channels:
            return "", [], 0.0

        all_words: List[Dict[str, Any]] = []
        transcript_parts: List[str] = []

        for ch in channels:
            alts = ch.get("alternatives", [])
            if alts:
                alt = alts[0]
                t = alt.get("transcript", "").strip()
                if t:
                    transcript_parts.append(t)
                for w in alt.get("words", []):
                    all_words.append({
                        "word": w.get("word", ""),
                        "start": w.get("start", 0.0),
                        "end": w.get("end", 0.0),
                        "confidence": float(w.get("confidence", 1.0)),
                    })

        full_text = " ".join(transcript_parts)
        avg_conf = sum(w["confidence"] for w in all_words) / max(1, len(all_words))
        return full_text, all_words, avg_conf

    async def audit_call(
        self,
        session: aiohttp.ClientSession,
        file_name: str,
        transcript_text: str,
        words: List[Dict[str, Any]],
        max_retries: int = 4
    ) -> Dict[str, Any]:
        """
        Phase D Implementation:
        Audits raw transcript using fast LLM with exact system instructions:
        1. Pre-filtering: Bypasses LLM for silent/voicemail/non-trading calls to stop token inflation.
        2. Phonetic Correction (fifty -> Nifty, C E -> CE, B Put -> PE)
        3. Spoken Number Conversion (rendayiram -> 2000, do sau -> 200)
        4. Confidence Thresholding (< 0.60 -> MANUAL_REVIEW_REQUIRED)
        5. Structured JSON output matching required schema.
        """
        clean_text = transcript_text.strip()
        if not clean_text or len(clean_text) < 12:
            return {
                "file_name": file_name,
                "trade_detected": False,
                "orders": [],
                "raw_summary": "Empty or silent audio transcript. No trade occurred."
            }

        # Check for voicemail patterns
        if VOICEMAIL_PATTERN.search(clean_text):
            return {
                "file_name": file_name,
                "trade_detected": False,
                "orders": [],
                "raw_summary": "Pre-filter: Voicemail or automated telephony recording detected. No trade occurred."
            }

        # Trap 3 Protection: Fast keyword gate to avoid expensive LLM calls on non-trade conversations
        if not TRADE_KEYWORD_PATTERN.search(clean_text):
            logger.debug(f"[{file_name}] Pre-filter: No trading keywords detected. Skipping LLM to prevent token inflation.")
            return {
                "file_name": file_name,
                "trade_detected": False,
                "orders": [],
                "raw_summary": "Pre-filter: No equity order parameters or trading intent detected in dialogue."
            }

        # Identify low confidence word spans to aid LLM evaluation (compact representation, not entire raw array)
        low_conf_words = [
            f"{w['word']}(conf={w['confidence']:.2f},t={w['start']:.1f}s)"
            for w in words if w.get("confidence", 1.0) < 0.60
        ]
        low_conf_summary = ", ".join(low_conf_words[:25]) if low_conf_words else "None"

        system_prompt = (
            "You are an Indian Equity Compliance and Trade Desk Auditor for NSE/BSE regulated brokerages.\n"
            "Your tasks are:\n"
            "1. Phonetic Correction: Map distorted phonetics from telephony speech to valid Indian stock tickers "
            "and derivatives (e.g., 'fifty' -> 'Nifty', 'C E' -> 'CE', 'P E' -> 'PE', 'B Put' -> 'PE', 'Reliance Industries' -> 'RELIANCE').\n"
            "2. Spoken Number Conversion: Resolve spoken regional numbers in Tamil (rendayiram -> 2000, pathayiram -> 10000) "
            "and Hindi (do sau -> 200, pachas -> 50, do lakh -> 200000) into exact numeric quantities and contract lots.\n"
            "3. Confidence Thresholding: If key entities (ticker, strike, action, quantity) were mumbled, ambiguous, "
            "or correspond to low confidence words (<0.60), flag confidence_flag as 'MANUAL_REVIEW_REQUIRED'. Otherwise 'PASSED'.\n"
            "4. Output STRICT JSON ONLY matching this format:\n"
            "{\n"
            '  "file_name": string,\n'
            '  "trade_detected": boolean,\n'
            '  "orders": [\n'
            "    {\n"
            '      "ticker": string,\n'
            '      "instrument": "CE" | "PE" | "EQ" | "FUT",\n'
            '      "strike_price": number | null,\n'
            '      "action": "BUY" | "SELL",\n'
            '      "quantity": number,\n'
            '      "order_type": "MARKET" | "LIMIT",\n'
            '      "confidence_flag": "PASSED" | "MANUAL_REVIEW_REQUIRED"\n'
            "    }\n"
            "  ],\n"
            '  "raw_summary": string\n'
            "}\n"
            "Never fabricate or guess orders. If the dialogue is a general inquiry, voicemail, or no trade instruction was authorized, "
            "set trade_detected: false and orders: []."
        )

        user_content = (
            f"FILE_NAME: {file_name}\n"
            f"LOW_CONFIDENCE_TOKENS_DETECTED (<0.60): {low_conf_summary}\n\n"
            f"RAW TRANSCRIPT STREAM:\n\"\"\"{clean_text}\"\"\""
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
            "max_tokens": 600
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        attempt = 0
        while attempt < max_retries:
            attempt += 1
            try:
                async with session.post(OPENAI_ENDPOINT, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    resp_text = await resp.text()
                    if resp.status == 200:
                        data = json.loads(resp_text)
                        content = data["choices"][0]["message"]["content"]
                        parsed = json.loads(content)
                        parsed["file_name"] = file_name
                        return parsed

                    if resp.status in (429, 500, 502, 503, 504):
                        delay = min(20.0, 1.5 * (2 ** (attempt - 1)) + random.uniform(0.1, 0.5))
                        logger.warning(f"[LLM Auditor] HTTP {resp.status} on {file_name}. Retry {attempt}/{max_retries}...")
                        await asyncio.sleep(delay)
                        continue

                    raise RuntimeError(f"OpenAI LLM HTTP {resp.status} Error: {resp_text}")

            except (aiohttp.ClientError, asyncio.TimeoutError) as err:
                delay = min(20.0, 1.5 * (2 ** (attempt - 1)) + random.uniform(0.1, 0.5))
                logger.warning(f"[LLM Auditor] Network error on {file_name}: {err}. Retry {attempt}/{max_retries}...")
                await asyncio.sleep(delay)

        raise RuntimeError(f"LLM Trade Extraction failed after {max_retries} retries for file {file_name}.")


# ========================================================================================
# EVIDENCE LINKING UTILITIES
# ========================================================================================
def link_order_evidence(
    order: Dict[str, Any],
    words: List[Dict[str, Any]],
    transcript_text: str
) -> Dict[str, Any]:
    """
    Links each detected trade order to its verifiable evidence:
    - Audio start time & end time
    - Raw transcribed sentence/clause
    - Deepgram confidence score
    """
    ticker = (order.get("ticker") or "").lower()
    instrument = (order.get("instrument") or "").lower()
    strike = str(int(order["strike_price"])) if order.get("strike_price") else ""
    action = (order.get("action") or "").lower()

    # Search for matching words in word-level timestamps
    matching_words: List[Dict[str, Any]] = []
    for w in words:
        w_text = w["word"].lower().strip()
        if w_text in ticker or ticker in w_text:
            matching_words.append(w)
        elif strike and strike in w_text:
            matching_words.append(w)
        elif instrument and instrument in w_text:
            matching_words.append(w)
        elif action and action in w_text:
            matching_words.append(w)

    if matching_words:
        start_time = min(w["start"] for w in matching_words)
        end_time = max(w["end"] for w in matching_words)
        avg_conf = sum(w["confidence"] for w in matching_words) / len(matching_words)
    else:
        # Fallback to general transcript bounds
        start_time = words[0]["start"] if words else 0.0
        end_time = words[-1]["end"] if words else 0.0
        avg_conf = sum(w["confidence"] for w in words) / max(1, len(words))

    # Extract local sentence clause containing the evidence
    sentences = [s.strip() for s in transcript_text.split(".") if s.strip()]
    raw_sentence = transcript_text[:200]
    for s in sentences:
        s_lower = s.lower()
        if (ticker and ticker in s_lower) or (strike and strike in s_lower):
            raw_sentence = s
            break

    # If any entity had confidence < 0.60, enforce MANUAL_REVIEW_REQUIRED
    flag = order.get("confidence_flag", "PASSED")
    if avg_conf < 0.60:
        flag = "MANUAL_REVIEW_REQUIRED"

    return {
        "start_time": round(start_time, 2),
        "end_time": round(end_time, 2),
        "raw_sentence": raw_sentence,
        "confidence_score": round(avg_conf, 4),
        "confidence_flag": flag,
    }


# ========================================================================================
# ASYNCHRONOUS WORKER & JOB COORDINATOR (5,000+ Calls)
# ========================================================================================
class BatchAuditPipeline:
    def __init__(
        self,
        batch_dir: Path,
        output_dir: Path,
        db_path: Path,
        deepgram_key: str,
        openai_key: str,
        desk_language: str = "en-IN",
        batch_id: str = "batch_001",
        concurrency: int = 10,
        ffmpeg_bin: Optional[str] = None,
        ffprobe_bin: Optional[str] = None,
        llm_model: str = "gpt-4o-mini",
    ):
        self.batch_dir = batch_dir
        self.output_dir = output_dir
        self.db_path = db_path
        self.desk_language = desk_language
        self.batch_id = batch_id
        self.concurrency = concurrency
        self.semaphore = asyncio.Semaphore(concurrency)
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.raw_dir = self.output_dir / "raw_transcripts"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.prep_dir = self.output_dir / "preprocessed_audio"
        self.prep_dir.mkdir(parents=True, exist_ok=True)
        self.failed_jobs_file = self.output_dir / "failed_jobs.json"

        self.db = init_db(self.db_path)
        self.preprocessor = AudioPreprocessor(ffmpeg_bin, ffprobe_bin)
        self.transcriber = DeepgramNova3Transcriber(deepgram_key, desk_language)
        self.auditor = LLMTradeAuditor(openai_key, llm_model)

        # Trap 1: Asynchronous Single-Writer DB Queue to eliminate SQLite lock contention
        self._db_queue: asyncio.Queue = asyncio.Queue()
        self._db_writer_task: Optional[asyncio.Task] = None

    @staticmethod
    def compute_sha256(filepath: Path) -> str:
        """Computes SHA-256 immediately for atomic tracking."""
        hasher = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(131072):
                hasher.update(chunk)
        return hasher.hexdigest()

    def discover_files(self) -> List[Path]:
        """Dynamically scans the upload batch directory (not static folder)."""
        if not self.batch_dir.exists():
            raise FileNotFoundError(f"Batch directory does not exist: {self.batch_dir}")

        found: List[Path] = []
        for root, _, files in os.walk(self.batch_dir):
            for file in files:
                p = Path(root) / file
                if p.suffix.lower() in SUPPORTED_AUDIO_EXTENSIONS:
                    found.append(p)
        return sorted(found)

    # ------------------------------------------------------------------------------------
    # DEDICATED DATABASE WRITER WORKER (ELIMINATES SQLITE_BUSY LOCK CONTENTION)
    # ------------------------------------------------------------------------------------
    async def _db_writer_worker(self):
        """
        Dedicated single-threaded coroutine that processes all DB write tasks sequentially.
        Ensures exactly ONE active writer transaction at any time, eliminating SQLITE_BUSY.
        """
        while True:
            item = await self._db_queue.get()
            if item is None:
                self._db_queue.task_done()
                break

            action, args, future = item
            try:
                if action == "record_status":
                    self._record_job_status_sync(*args)
                elif action == "save_raw_transcript":
                    self._save_raw_transcript_sync(*args)
                elif action == "save_trades":
                    self._save_trades_sync(*args)

                if future and not future.done():
                    future.set_result(True)
            except Exception as e:
                logger.error(f"[DB Writer] Error executing {action}: {e}")
                if future and not future.done():
                    future.set_exception(e)
            finally:
                self._db_queue.task_done()

    def _record_job_status_sync(
        self,
        file_hash: str,
        file_name: str,
        size_bytes: int,
        duration: float,
        channels: int,
        sample_rate: int,
        status: str,
        error_code: Optional[str] = None,
        error_stack: Optional[str] = None,
        raw_storage_path: Optional[str] = None
    ):
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self.db:
            self.db.execute("""
                INSERT INTO call_records (
                    file_hash, file_name, file_size_bytes, duration_seconds,
                    channels, sample_rate, desk_language, batch_id,
                    upload_timestamp, processing_status, error_code, error_stack,
                    raw_storage_path, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(file_hash) DO UPDATE SET
                    processing_status = excluded.processing_status,
                    error_code = excluded.error_code,
                    error_stack = excluded.error_stack,
                    raw_storage_path = COALESCE(excluded.raw_storage_path, call_records.raw_storage_path),
                    updated_at = excluded.updated_at;
            """, (
                file_hash, file_name, size_bytes, duration,
                channels, sample_rate, self.desk_language, self.batch_id,
                now, status, error_code, error_stack, raw_storage_path, now
            ))

    def _save_raw_transcript_sync(
        self,
        file_hash: str,
        file_name: str,
        transcript_text: str,
        raw_json_str: str,
        avg_conf: float,
        word_count: int,
        now_str: str
    ):
        with self.db:
            self.db.execute("""
                INSERT INTO raw_transcripts (
                    file_hash, file_name, transcript_text, raw_json,
                    average_confidence, word_count, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(file_hash) DO UPDATE SET
                    transcript_text = excluded.transcript_text,
                    raw_json = excluded.raw_json,
                    average_confidence = excluded.average_confidence,
                    word_count = excluded.word_count,
                    created_at = excluded.created_at;
            """, (
                file_hash, file_name, transcript_text, raw_json_str,
                avg_conf, word_count, now_str
            ))

    def _save_trades_sync(
        self,
        file_hash: str,
        file_name: str,
        trade_detected: bool,
        orders: List[Dict[str, Any]],
        words: List[Dict[str, Any]],
        transcript_text: str,
        avg_conf: float,
        raw_summary: str,
        now_str: str
    ):
        with self.db:
            self.db.execute("DELETE FROM trades WHERE file_hash = ?;", (file_hash,))
            if trade_detected and orders:
                for order in orders:
                    ev = link_order_evidence(order, words, transcript_text)
                    self.db.execute("""
                        INSERT INTO trades (
                            file_hash, file_name, trade_detected, ticker, instrument,
                            strike_price, action, quantity, order_type, confidence_flag,
                            evidence_start_time, evidence_end_time, raw_sentence,
                            confidence_score, raw_summary, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """, (
                        file_hash, file_name, 1,
                        order.get("ticker"), order.get("instrument"),
                        order.get("strike_price"), order.get("action"),
                        order.get("quantity"), order.get("order_type"),
                        ev["confidence_flag"], ev["start_time"], ev["end_time"],
                        ev["raw_sentence"], ev["confidence_score"], raw_summary, now_str
                    ))
            else:
                self.db.execute("""
                    INSERT INTO trades (
                        file_hash, file_name, trade_detected, ticker, instrument,
                        strike_price, action, quantity, order_type, confidence_flag,
                        evidence_start_time, evidence_end_time, raw_sentence,
                        confidence_score, raw_summary, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    file_hash, file_name, 0,
                    None, None, None, None, None, None, "PASSED",
                    0.0, 0.0, transcript_text[:200], avg_conf, raw_summary, now_str
                ))

    async def record_job_status(
        self,
        file_hash: str,
        file_name: str,
        size_bytes: int,
        duration: float,
        channels: int,
        sample_rate: int,
        status: str,
        error_code: Optional[str] = None,
        error_stack: Optional[str] = None,
        raw_storage_path: Optional[str] = None
    ):
        """Enqueues atomic job status write to the dedicated background writer."""
        args = (file_hash, file_name, size_bytes, duration, channels, sample_rate, status, error_code, error_stack, raw_storage_path)
        if self._db_writer_task and not self._db_writer_task.done():
            fut = asyncio.get_running_loop().create_future()
            await self._db_queue.put(("record_status", args, fut))
            await fut
        else:
            self._record_job_status_sync(*args)

    async def save_raw_transcript(
        self,
        file_hash: str,
        file_name: str,
        transcript_text: str,
        raw_json_str: str,
        avg_conf: float,
        word_count: int,
        now_str: str
    ):
        args = (file_hash, file_name, transcript_text, raw_json_str, avg_conf, word_count, now_str)
        if self._db_writer_task and not self._db_writer_task.done():
            fut = asyncio.get_running_loop().create_future()
            await self._db_queue.put(("save_raw_transcript", args, fut))
            await fut
        else:
            self._save_raw_transcript_sync(*args)

    async def save_trades(
        self,
        file_hash: str,
        file_name: str,
        trade_detected: bool,
        orders: List[Dict[str, Any]],
        words: List[Dict[str, Any]],
        transcript_text: str,
        avg_conf: float,
        raw_summary: str,
        now_str: str
    ):
        args = (file_hash, file_name, trade_detected, orders, words, transcript_text, avg_conf, raw_summary, now_str)
        if self._db_writer_task and not self._db_writer_task.done():
            fut = asyncio.get_running_loop().create_future()
            await self._db_queue.put(("save_trades", args, fut))
            await fut
        else:
            self._save_trades_sync(*args)

    def write_failed_job_dlq(self, file_hash: str, file_name: str, error_code: str, error_detail: str):
        """Appends failed call to dead-letter queue (failed_jobs.json)."""
        record = {
            "file_hash": file_hash,
            "file_name": file_name,
            "batch_id": self.batch_id,
            "error_code": error_code,
            "error_detail": error_detail,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        
        current_data = []
        if self.failed_jobs_file.exists():
            try:
                with open(self.failed_jobs_file, "r", encoding="utf-8") as f:
                    current_data = json.load(f)
            except Exception:
                current_data = []
                
        current_data.append(record)
        with open(self.failed_jobs_file, "w", encoding="utf-8") as f:
            json.dump(current_data, f, indent=2)

    async def process_single_call(
        self,
        session: aiohttp.ClientSession,
        audio_file: Path
    ) -> Optional[Dict[str, Any]]:
        """
        Processes one call through FFmpeg, Deepgram Nova-3, and LLM Auditor.
        Guarantees zero mock data and atomic traceability.
        """
        async with self.semaphore:
            file_name = audio_file.name
            size_bytes = audio_file.stat().st_size
            file_hash = self.compute_sha256(audio_file)
            logger.info(f"[{file_hash[:8]}] Processing {file_name} ({size_bytes / 1024:.1f} KB)...")

            # 1. Atomic registration & cache invalidation
            await self.record_job_status(
                file_hash, file_name, size_bytes, 0.0, 1, 16000, "PREPROCESSING"
            )

            try:
                # 2. Phase A: Automated FFmpeg Preprocessing
                prep_path, channels, sample_rate, duration, is_multichannel = (
                    self.preprocessor.preprocess(audio_file, self.prep_dir)
                )

                await self.record_job_status(
                    file_hash, file_name, size_bytes, duration, channels, sample_rate, "TRANSCRIBING"
                )

                # 3. Phase B & C: Deepgram Nova-3 Call (with 429 backoff)
                dg_result = await self.transcriber.transcribe_file(
                    session=session,
                    audio_path=prep_path,
                    is_multichannel=is_multichannel,
                    desk_language=self.desk_language
                )

                # 4. Save raw Deepgram JSON response under {file_hash}_raw.json
                raw_json_path = self.raw_dir / f"{file_hash}_raw.json"
                with open(raw_json_path, "w", encoding="utf-8") as f:
                    json.dump(dg_result, f, indent=2)

                transcript_text, words, avg_conf = (
                    self.auditor.extract_full_transcript_and_words(dg_result)
                )

                # Save raw transcript in database via async queue
                now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
                await self.save_raw_transcript(
                    file_hash, file_name, transcript_text, json.dumps(dg_result),
                    avg_conf, len(words), now_str
                )

                await self.record_job_status(
                    file_hash, file_name, size_bytes, duration, channels, sample_rate, "AUDITING",
                    raw_storage_path=str(raw_json_path)
                )

                # 5. Phase D: LLM Trade Reconstruction & Confidence Auditing Layer (with Pre-filter gate)
                audit_result = await self.auditor.audit_call(
                    session=session,
                    file_name=file_name,
                    transcript_text=transcript_text,
                    words=words
                )

                trade_detected = bool(audit_result.get("trade_detected", False))
                orders = audit_result.get("orders", [])
                raw_summary = audit_result.get("raw_summary", "")

                # 6. Traceable Evidence Verification & Database Insertion via async queue
                await self.save_trades(
                    file_hash, file_name, trade_detected, orders, words,
                    transcript_text, avg_conf, raw_summary, now_str
                )

                await self.record_job_status(
                    file_hash, file_name, size_bytes, duration, channels, sample_rate, "COMPLETED",
                    raw_storage_path=str(raw_json_path)
                )

                logger.info(f"[{file_hash[:8]}] COMPLETED {file_name}: {len(orders)} order(s) detected.")
                return audit_result

            except Exception as e:
                err_code = type(e).__name__
                err_stack = traceback.format_exc()
                logger.error(f"[{file_hash[:8]}] FAILED {file_name} ({err_code}): {e}")

                # Record error in DB & DLQ (NO SWALLOWING)
                await self.record_job_status(
                    file_hash, file_name, size_bytes, 0.0, 1, 16000, "FAILED",
                    error_code=err_code, error_stack=err_stack
                )
                self.write_failed_job_dlq(file_hash, file_name, err_code, str(e))
                return None

    async def run(self, limit: Optional[int] = None) -> Dict[str, Any]:
        """Runs the asynchronous pipeline over all discovered calls."""
        files = self.discover_files()
        if limit and limit > 0:
            files = files[:limit]
            logger.info(f"Running limited test batch of {len(files)} call(s)...")

        total_files = len(files)
        logger.info(f"Discovered {total_files} audio calls in {self.batch_dir}.")

        if total_files == 0:
            logger.warning("No audio files found to process.")
            return self.generate_sql_summary_report()

        # Start dedicated DB writer worker (Trap 1: eliminates SQLite write lock contention)
        self._db_writer_task = asyncio.create_task(self._db_writer_worker())

        try:
            conn_limit = aiohttp.TCPConnector(limit=self.concurrency + 5)
            async with aiohttp.ClientSession(connector=conn_limit) as session:
                tasks = [self.process_single_call(session, f) for f in files]
                await asyncio.gather(*tasks, return_exceptions=False)
        finally:
            # Drain and stop the DB writer worker cleanly
            await self._db_queue.join()
            await self._db_queue.put(None)
            await self._db_writer_task

        # Export CSV/JSONL results and compute SQL-only metrics
        self.export_audit_results()
        return self.generate_sql_summary_report()

    def export_audit_results(self):
        """Exports complete audit results to audit_results.csv and audit_results.jsonl."""
        csv_file = self.output_dir / "audit_results.csv"
        jsonl_file = self.output_dir / "audit_results.jsonl"

        rows = self.db.execute("""
            SELECT 
                t.id, t.file_hash, t.file_name, t.trade_detected,
                t.ticker, t.instrument, t.strike_price, t.action,
                t.quantity, t.order_type, t.confidence_flag,
                t.evidence_start_time, t.evidence_end_time,
                t.confidence_score, t.raw_sentence, t.raw_summary,
                c.duration_seconds, c.processing_status, c.desk_language
            FROM trades t
            JOIN call_records c ON t.file_hash = c.file_hash
            WHERE c.batch_id = ?
            ORDER BY t.id ASC;
        """, (self.batch_id,)).fetchall()

        fieldnames = [
            "id", "file_hash", "file_name", "trade_detected",
            "ticker", "instrument", "strike_price", "action",
            "quantity", "order_type", "confidence_flag",
            "evidence_start_time", "evidence_end_time",
            "confidence_score", "raw_sentence", "raw_summary",
            "duration_seconds", "processing_status", "desk_language"
        ]

        with open(csv_file, "w", newline="", encoding="utf-8") as f_csv, \
             open(jsonl_file, "w", encoding="utf-8") as f_jsonl:

            writer = csv.DictWriter(f_csv, fieldnames=fieldnames)
            writer.writeheader()

            for r in rows:
                d = dict(r)
                writer.writerow(d)
                f_jsonl.write(json.dumps(d) + "\n")

        logger.info(f"Audit results exported to:\n  - {csv_file}\n  - {jsonl_file}")

    def generate_sql_summary_report(self) -> Dict[str, Any]:
        """
        Constraint 5: Aggregate reports from SQL ONLY.
        Zero LLM hallucinations or hardcoded mock summaries.
        """
        summary_query = """
            SELECT
                COUNT(DISTINCT c.file_hash) AS total_calls_ingested,
                COUNT(DISTINCT CASE WHEN c.processing_status = 'COMPLETED' THEN c.file_hash END) AS total_calls_completed,
                COUNT(DISTINCT CASE WHEN c.processing_status = 'FAILED' THEN c.file_hash END) AS total_calls_failed,
                COUNT(DISTINCT CASE WHEN t.trade_detected = 1 THEN t.id END) AS total_trades_detected,
                COALESCE(SUM(CASE WHEN t.trade_detected = 1 THEN t.quantity ELSE 0 END), 0) AS total_lots_traded,
                COUNT(DISTINCT CASE WHEN t.confidence_flag = 'MANUAL_REVIEW_REQUIRED' THEN t.id END) AS manual_review_flagged_count,
                COUNT(DISTINCT CASE WHEN t.trade_detected = 1 AND t.confidence_flag = 'PASSED' THEN t.id END) AS passed_trades_count,
                COUNT(DISTINCT CASE WHEN t.action = 'BUY' THEN t.id END) AS buy_orders_count,
                COUNT(DISTINCT CASE WHEN t.action = 'SELL' THEN t.id END) AS sell_orders_count
            FROM call_records c
            LEFT JOIN trades t ON c.file_hash = t.file_hash
            WHERE c.batch_id = ?;
        """
        row = self.db.execute(summary_query, (self.batch_id,)).fetchone()
        stats = dict(row) if row else {}

        total_trades = stats.get("total_trades_detected", 0)
        passed = stats.get("passed_trades_count", 0)
        compliance_rate = (passed / total_trades * 100.0) if total_trades > 0 else 100.0
        stats["compliance_rate_percent"] = round(compliance_rate, 2)

        # Instrument breakdown query
        inst_query = """
            SELECT instrument, COUNT(*) as count, SUM(quantity) as lots
            FROM trades
            WHERE file_hash IN (SELECT file_hash FROM call_records WHERE batch_id = ?)
              AND trade_detected = 1
            GROUP BY instrument;
        """
        inst_rows = self.db.execute(inst_query, (self.batch_id,)).fetchall()
        stats["instrument_breakdown"] = {r["instrument"]: {"count": r["count"], "lots": r["lots"]} for r in inst_rows}

        logger.info("\n" + "="*70)
        logger.info("AUDIT ENGINE SUMMARY METRICS (COMPUTED FROM DIRECT SQL ONLY)")
        logger.info("="*70)
        logger.info(f"Batch ID:                  {self.batch_id}")
        logger.info(f"Total Calls Ingested:      {stats.get('total_calls_ingested', 0)}")
        logger.info(f"Total Calls Completed:     {stats.get('total_calls_completed', 0)}")
        logger.info(f"Total Calls Failed:        {stats.get('total_calls_failed', 0)}")
        logger.info(f"Total Trades Detected:     {stats.get('total_trades_detected', 0)}")
        logger.info(f"Total Lots Traded:         {stats.get('total_lots_traded', 0)}")
        logger.info(f"Manual Review Flags:       {stats.get('manual_review_flagged_count', 0)}")
        logger.info(f"Compliance Pass Rate:      {stats.get('compliance_rate_percent', 100.0)}%")
        logger.info(f"Orders Breakdown (BUY):    {stats.get('buy_orders_count', 0)}")
        logger.info(f"Orders Breakdown (SELL):   {stats.get('sell_orders_count', 0)}")
        logger.info("="*70)

        # Save summary report to JSON
        summary_file = self.output_dir / "batch_summary_report.json"
        with open(summary_file, "w", encoding="utf-8") as f:
            json.dump(stats, f, indent=2)

        return stats

    def close(self):
        """Closes the underlying database connection."""
        if hasattr(self, 'db') and self.db:
            try:
                self.db.close()
            except Exception:
                pass


# ========================================================================================
# CLI ENTRY POINT
# ========================================================================================
def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Indian Equity Audio Transcription & Dynamic Order Extraction Pipeline (Deepgram Nova-3 + LLM Auditor)"
    )
    parser.add_argument(
        "--batch-dir",
        type=Path,
        default=Path("./data/calls"),
        help="Path to folder containing audio calls for ingestion (dynamically scanned)."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./data/audit_output"),
        help="Path where exports (CSV, JSONL, raw transcripts) will be written."
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("./.data/auditeq_production.db"),
        help="Path to SQLite database for atomic tracking and SQL aggregation."
    )
    parser.add_argument(
        "--desk-lang",
        type=str,
        default="en-IN",
        choices=["ta", "hi", "en-IN"],
        help="Branch/desk language routing: 'ta' (Tamil), 'hi' (Hindi), or 'en-IN' (English/Pan-India)."
    )
    parser.add_argument(
        "--batch-id",
        type=str,
        default=f"batch_{datetime.date.today().strftime('%Y%m%d')}",
        help="Unique identifier for the current ingestion batch."
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=10,
        help="Maximum concurrent asynchronous workers (default: 10). Recommended 5-10 for standard/Growth tier Deepgram projects; 20+ for Enterprise concurrency tiers."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on number of calls to process (e.g. --limit 5 for a quick sanity test batch)."
    )
    parser.add_argument(
        "--llm-model",
        type=str,
        default="gpt-4o-mini",
        help="LLM model for phonetic correction and trade extraction (default: gpt-4o-mini)."
    )
    parser.add_argument(
        "--ffmpeg-path",
        type=str,
        default=None,
        help="Custom path to ffmpeg binary."
    )
    parser.add_argument(
        "--ffprobe-path",
        type=str,
        default=None,
        help="Custom path to ffprobe binary."
    )
    return parser.parse_args()


def main():
    args = parse_arguments()

    deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

    if not deepgram_key:
        logger.error("DEEPGRAM_API_KEY environment variable is required.")
        sys.exit(1)

    if not openai_key:
        logger.error("OPENAI_API_KEY environment variable is required.")
        sys.exit(1)

    pipeline = BatchAuditPipeline(
        batch_dir=args.batch_dir,
        output_dir=args.output_dir,
        db_path=args.db_path,
        deepgram_key=deepgram_key,
        openai_key=openai_key,
        desk_language=args.desk_lang,
        batch_id=args.batch_id,
        concurrency=args.concurrency,
        ffmpeg_bin=args.ffmpeg_path,
        ffprobe_bin=args.ffprobe_path,
        llm_model=args.llm_model,
    )

    try:
        asyncio.run(pipeline.run(limit=args.limit))
    except KeyboardInterrupt:
        logger.warning("Pipeline execution interrupted by user.")
        sys.exit(130)
    finally:
        pipeline.close()


if __name__ == "__main__":
    main()
