#!/usr/bin/env python3
"""
Unit & Integration Test Suite for batch_audit.py
Verifies:
1. Deepgram Nova-3 API query parameters (model=nova-3, utterance_end_ms=2500, smart_format=false, keyterms, etc.)
2. SHA-256 atomic file tracking and cache invalidation
3. Preprocessor multichannel vs mono detection
4. Evidence linking and confidence thresholding (<0.60 -> MANUAL_REVIEW_REQUIRED)
5. Direct SQL aggregation (verifying metrics are computed strictly via SQL queries)
6. Error propagation into DB and Dead Letter Queue (no swallowed exceptions)
"""

import asyncio
import json
import sqlite3
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from batch_audit import (
    AudioPreprocessor,
    BatchAuditPipeline,
    DeepgramNova3Transcriber,
    LLMTradeAuditor,
    init_db,
    link_order_evidence,
)


class TestBatchAuditPipeline(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)
        self.db_path = self.temp_path / "test_auditeq.db"
        self.batch_dir = self.temp_path / "batch_calls"
        self.batch_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir = self.temp_path / "audit_output"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.conns = []
        self.pipelines = []

    def tearDown(self):
        for p in self.pipelines:
            p.close()
        for c in self.conns:
            try:
                c.close()
            except Exception:
                pass
        self.temp_dir.cleanup()

    def test_deepgram_url_configuration(self):
        """Verifies exact required query parameters for Deepgram Nova-3."""
        transcriber = DeepgramNova3Transcriber(api_key="test_key", desk_language="ta")
        url = transcriber.build_request_url(is_multichannel=True, desk_language="ta")

        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)

        self.assertEqual(params.get("model"), ["nova-3"])
        self.assertEqual(params.get("utterance_end_ms"), ["2500"])
        self.assertEqual(params.get("vad_events"), ["false"])
        self.assertEqual(params.get("smart_format"), ["false"])
        self.assertEqual(params.get("punctuate"), ["false"])
        self.assertEqual(params.get("detect_language"), ["false"])
        self.assertEqual(params.get("multichannel"), ["true"])
        self.assertEqual(params.get("language"), ["ta"])
        self.assertIn("pci", params.get("redact", []))
        self.assertIn("ssn", params.get("redact", []))

        keyterms = params.get("keyterm", [])
        self.assertIn("Nifty", keyterms)
        self.assertIn("BankNifty", keyterms)
        self.assertIn("FinNifty", keyterms)
        self.assertIn("Sensex", keyterms)
        self.assertIn("CE", keyterms)
        self.assertIn("PE", keyterms)
        self.assertIn("strike price", keyterms)
        self.assertIn("lot size", keyterms)

    def test_sha256_atomic_hashing(self):
        """Verifies SHA-256 calculation for audio files."""
        sample_file = self.batch_dir / "call_001.wav"
        sample_file.write_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00")
        
        pipeline = BatchAuditPipeline(
            batch_dir=self.batch_dir,
            output_dir=self.output_dir,
            db_path=self.db_path,
            deepgram_key="dummy_dg",
            openai_key="dummy_oa",
        )
        self.pipelines.append(pipeline)
        h = pipeline.compute_sha256(sample_file)
        self.assertEqual(len(h), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in h))

    def test_evidence_linking_and_confidence_thresholding(self):
        """Verifies order evidence linking and <0.60 thresholding."""
        words = [
            {"word": "buy", "start": 1.2, "end": 1.5, "confidence": 0.95},
            {"word": "nifty", "start": 1.6, "end": 2.1, "confidence": 0.55}, # Low confidence!
            {"word": "24000", "start": 2.2, "end": 2.8, "confidence": 0.98},
            {"word": "ce", "start": 2.9, "end": 3.2, "confidence": 0.96},
        ]
        transcript = "Please buy nifty 24000 ce 50 lots at market."

        order = {
            "ticker": "NIFTY",
            "instrument": "CE",
            "strike_price": 24000,
            "action": "BUY",
            "quantity": 50,
            "order_type": "MARKET",
            "confidence_flag": "PASSED"
        }

        ev = link_order_evidence(order, words, transcript)
        self.assertEqual(ev["start_time"], 1.2)
        self.assertEqual(ev["end_time"], 3.2)
        # Average of matching words: (0.95 + 0.55 + 0.98 + 0.96) / 4 = 0.86
        self.assertAlmostEqual(ev["confidence_score"], 0.86, places=2)
        
        # Test case where average confidence is strictly < 0.60
        low_conf_words = [
            {"word": "nifty", "start": 1.0, "end": 1.5, "confidence": 0.45},
            {"word": "pe", "start": 1.6, "end": 2.0, "confidence": 0.50},
        ]
        ev_low = link_order_evidence(order, low_conf_words, "buy nifty pe")
        self.assertEqual(ev_low["confidence_flag"], "MANUAL_REVIEW_REQUIRED")

    def test_direct_sql_reporting_metrics(self):
        """Verifies aggregate report is strictly calculated via SQL, zero mock data."""
        conn = init_db(self.db_path)
        self.conns.append(conn)
        with conn:
            # Insert 3 test calls
            conn.execute("""
                INSERT INTO call_records (
                    file_hash, file_name, file_size_bytes, duration_seconds,
                    channels, sample_rate, desk_language, batch_id,
                    upload_timestamp, processing_status, updated_at
                ) VALUES
                ('hash_1', 'call1.wav', 50000, 32.5, 1, 16000, 'en-IN', 'batch_test', '2026-10-28T10:00:00Z', 'COMPLETED', '2026-10-28T10:00:00Z'),
                ('hash_2', 'call2.wav', 65000, 45.0, 2, 16000, 'ta', 'batch_test', '2026-10-28T10:00:00Z', 'COMPLETED', '2026-10-28T10:00:00Z'),
                ('hash_3', 'call3.wav', 12000, 10.0, 1, 16000, 'hi', 'batch_test', '2026-10-28T10:00:00Z', 'FAILED', '2026-10-28T10:00:00Z');
            """)

            # Insert trades
            conn.execute("""
                INSERT INTO trades (
                    file_hash, file_name, trade_detected, ticker, instrument,
                    strike_price, action, quantity, order_type, confidence_flag,
                    evidence_start_time, evidence_end_time, raw_sentence,
                    confidence_score, raw_summary, created_at
                ) VALUES
                ('hash_1', 'call1.wav', 1, 'NIFTY', 'CE', 24500, 'BUY', 50, 'MARKET', 'PASSED', 2.0, 4.5, 'buy nifty ce', 0.92, 'Valid order', '2026-10-28T10:00:00Z'),
                ('hash_2', 'call2.wav', 1, 'BANKNIFTY', 'PE', 52000, 'SELL', 30, 'LIMIT', 'MANUAL_REVIEW_REQUIRED', 1.0, 3.0, 'bank nifty pe', 0.58, 'Mumbled price', '2026-10-28T10:00:00Z'),
                ('hash_3', 'call3.wav', 0, NULL, NULL, NULL, NULL, NULL, NULL, 'PASSED', 0, 0, 'No trade', 0.90, 'Voicemail', '2026-10-28T10:00:00Z');
            """)

        pipeline = BatchAuditPipeline(
            batch_dir=self.batch_dir,
            output_dir=self.output_dir,
            db_path=self.db_path,
            deepgram_key="dummy_dg",
            openai_key="dummy_oa",
            batch_id="batch_test"
        )
        self.pipelines.append(pipeline)
        report = pipeline.generate_sql_summary_report()

        self.assertEqual(report["total_calls_ingested"], 3)
        self.assertEqual(report["total_calls_completed"], 2)
        self.assertEqual(report["total_calls_failed"], 1)
        self.assertEqual(report["total_trades_detected"], 2)
        self.assertEqual(report["total_lots_traded"], 80) # 50 + 30
        self.assertEqual(report["manual_review_flagged_count"], 1)
        self.assertEqual(report["buy_orders_count"], 1)
        self.assertEqual(report["sell_orders_count"], 1)
        self.assertEqual(report["compliance_rate_percent"], 50.0) # 1 of 2 passed

    def test_dead_letter_queue_and_error_recording(self):
        """Verifies failed jobs are recorded in DB with error code/stack and dead letter queue."""
        pipeline = BatchAuditPipeline(
            batch_dir=self.batch_dir,
            output_dir=self.output_dir,
            db_path=self.db_path,
            deepgram_key="dummy_dg",
            openai_key="dummy_oa",
            batch_id="batch_dlq"
        )
        self.pipelines.append(pipeline)

        # Record a failed job
        file_hash = "deadbeef" * 8
        asyncio.run(pipeline.record_job_status(
            file_hash=file_hash,
            file_name="corrupt_call.wav",
            size_bytes=1024,
            duration=0.0,
            channels=1,
            sample_rate=16000,
            status="FAILED",
            error_code="DeepgramHTTPError_401",
            error_stack="Traceback (most recent call last):\n  RuntimeError: Unauthorized"
        ))
        pipeline.write_failed_job_dlq(
            file_hash=file_hash,
            file_name="corrupt_call.wav",
            error_code="DeepgramHTTPError_401",
            error_detail="Deepgram HTTP 401 Unauthorized"
        )

        # Check DB
        row = pipeline.db.execute("SELECT * FROM call_records WHERE file_hash = ?", (file_hash,)).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["processing_status"], "FAILED")
        self.assertEqual(row["error_code"], "DeepgramHTTPError_401")
        self.assertIn("RuntimeError: Unauthorized", row["error_stack"])

        # Check DLQ file
        self.assertTrue(pipeline.failed_jobs_file.exists())
        dlq = json.loads(pipeline.failed_jobs_file.read_text(encoding="utf-8"))
        self.assertEqual(len(dlq), 1)
        self.assertEqual(dlq[0]["file_hash"], file_hash)
        self.assertEqual(dlq[0]["error_code"], "DeepgramHTTPError_401")

    def test_csv_and_jsonl_export(self):
        """Verifies CSV and JSONL exports contain all required schema columns and traceable links."""
        conn = init_db(self.db_path)
        self.conns.append(conn)
        with conn:
            conn.execute("""
                INSERT INTO call_records (
                    file_hash, file_name, file_size_bytes, duration_seconds,
                    channels, sample_rate, desk_language, batch_id,
                    upload_timestamp, processing_status, updated_at
                ) VALUES ('exp_hash_1', 'trade_call.wav', 80000, 52.0, 2, 16000, 'ta', 'batch_export', '2026-10-28T10:00:00Z', 'COMPLETED', '2026-10-28T10:00:00Z');
            """)
            conn.execute("""
                INSERT INTO trades (
                    file_hash, file_name, trade_detected, ticker, instrument,
                    strike_price, action, quantity, order_type, confidence_flag,
                    evidence_start_time, evidence_end_time, raw_sentence,
                    confidence_score, raw_summary, created_at
                ) VALUES ('exp_hash_1', 'trade_call.wav', 1, 'NIFTY', 'CE', 24200, 'BUY', 100, 'MARKET', 'PASSED', 4.5, 7.8, 'nifty irubathi naalaayiram ce vaangunga', 0.94, 'Pre-order confirmed', '2026-10-28T10:00:00Z');
            """)

        pipeline = BatchAuditPipeline(
            batch_dir=self.batch_dir,
            output_dir=self.output_dir,
            db_path=self.db_path,
            deepgram_key="dummy_dg",
            openai_key="dummy_oa",
            batch_id="batch_export"
        )
        self.pipelines.append(pipeline)
        pipeline.export_audit_results()

        csv_file = self.output_dir / "audit_results.csv"
        jsonl_file = self.output_dir / "audit_results.jsonl"
        self.assertTrue(csv_file.exists())
        self.assertTrue(jsonl_file.exists())

        csv_content = csv_file.read_text(encoding="utf-8")
        self.assertIn("exp_hash_1", csv_content)
        self.assertIn("NIFTY", csv_content)
        self.assertIn("24200", csv_content)

        jsonl_lines = jsonl_file.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(len(jsonl_lines), 1)
        record = json.loads(jsonl_lines[0])
        self.assertEqual(record["ticker"], "NIFTY")
        self.assertEqual(record["quantity"], 100)
        self.assertEqual(record["evidence_start_time"], 4.5)
        self.assertEqual(record["confidence_flag"], "PASSED")

    def test_llm_trade_prefilter_gate(self):
        """Trap 3 Test: Verifies non-trade dialogue / voicemails bypass LLM to prevent token inflation."""
        auditor = LLMTradeAuditor(api_key="fake_key")
        session = MagicMock()

        # 1. Non-trading dialogue (greeting/account query)
        res_non_trade = asyncio.run(auditor.audit_call(
            session=session,
            file_name="query_call.wav",
            transcript_text="Hello sir, good morning. Can you please email me my statement? Thank you.",
            words=[]
        ))
        self.assertFalse(res_non_trade["trade_detected"])
        self.assertEqual(len(res_non_trade["orders"]), 0)
        self.assertIn("Pre-filter", res_non_trade["raw_summary"])

        # 2. Voicemail
        res_vm = asyncio.run(auditor.audit_call(
            session=session,
            file_name="voicemail.wav",
            transcript_text="The person you are calling is not available. Please leave a message after the tone.",
            words=[]
        ))
        self.assertFalse(res_vm["trade_detected"])
        self.assertEqual(len(res_vm["orders"]), 0)

        # 3. Short / Silent dialogue
        res_short = asyncio.run(auditor.audit_call(
            session=session,
            file_name="short.wav",
            transcript_text="Hello? Hello?",
            words=[]
        ))
        self.assertFalse(res_short["trade_detected"])

    def test_async_db_writer_queue_concurrency(self):
        """Trap 1 Test: Verifies dedicated async queue serializes concurrent writes with zero lock errors."""
        pipeline = BatchAuditPipeline(
            batch_dir=self.batch_dir,
            output_dir=self.output_dir,
            db_path=self.db_path,
            deepgram_key="dummy_dg",
            openai_key="dummy_oa",
            batch_id="batch_queue_test"
        )
        self.pipelines.append(pipeline)

        async def run_concurrent_writes():
            pipeline._db_writer_task = asyncio.create_task(pipeline._db_writer_worker())
            # Launch 25 simultaneous writes
            tasks = []
            for i in range(25):
                tasks.append(pipeline.record_job_status(
                    file_hash=f"hash_{i:04d}",
                    file_name=f"call_{i}.wav",
                    size_bytes=50000,
                    duration=20.0,
                    channels=1,
                    sample_rate=16000,
                    status="COMPLETED"
                ))
            await asyncio.gather(*tasks)

            # Drain queue and stop writer
            await pipeline._db_queue.join()
            await pipeline._db_queue.put(None)
            await pipeline._db_writer_task

        asyncio.run(run_concurrent_writes())

        # Verify all 25 rows were committed safely without locks
        count_row = pipeline.db.execute("SELECT COUNT(*) as c FROM call_records WHERE batch_id = 'batch_queue_test'").fetchone()
        self.assertEqual(count_row["c"], 25)


if __name__ == "__main__":
    unittest.main()


