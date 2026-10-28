-- ==============================================================================
-- Migration: 002_dynamic_audit_trail.sql
-- Production Dynamic Traceable Audio Audit Schema (SEBI / NSE Compliance)
-- Authoritative Schema for SHA-256 Atomic File Tracking, Deepgram Nova-3 Raw Storage,
-- LLM Evidence Linking, and SQL-Aggregated Dashboard Reporting.
-- ==============================================================================

BEGIN;

-- 1. ATOMIC CALL FILE AUDIT RECORDS (Indexed by SHA-256 File Hash)
CREATE TABLE IF NOT EXISTS call_records (
    file_hash CHAR(64) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    duration_seconds REAL NOT NULL DEFAULT 0.0,
    channels INT NOT NULL DEFAULT 1,
    sample_rate INT NOT NULL DEFAULT 16000,
    desk_language VARCHAR(20) NOT NULL DEFAULT 'en-IN',
    batch_id VARCHAR(100) NOT NULL DEFAULT 'default_batch',
    upload_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status VARCHAR(50) NOT NULL DEFAULT 'QUEUED', -- 'QUEUED', 'PREPROCESSING', 'TRANSCRIBING', 'AUDITING', 'COMPLETED', 'FAILED'
    error_code VARCHAR(100),
    error_stack TEXT,
    raw_storage_path TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_records_status ON call_records(processing_status);
CREATE INDEX IF NOT EXISTS idx_call_records_batch ON call_records(batch_id);

-- 2. RAW DEEPGRAM TRANSCRIPTS (Immutable Evidence Vault)
CREATE TABLE IF NOT EXISTS raw_transcripts (
    file_hash CHAR(64) PRIMARY KEY REFERENCES call_records(file_hash) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    transcript_text TEXT NOT NULL,
    raw_json TEXT NOT NULL, -- Stored as JSON string or JSONB
    average_confidence REAL DEFAULT 0.0,
    word_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TRACEABLE TRADE ORDERS WITH DIRECT EVIDENCE LINKING
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    file_hash CHAR(64) NOT NULL REFERENCES call_records(file_hash) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    trade_detected BOOLEAN NOT NULL DEFAULT TRUE,
    ticker VARCHAR(100),
    instrument VARCHAR(20), -- 'CE', 'PE', 'EQ', 'FUT'
    strike_price NUMERIC(12, 2),
    action VARCHAR(20),     -- 'BUY', 'SELL'
    quantity INT,
    order_type VARCHAR(20), -- 'MARKET', 'LIMIT'
    confidence_flag VARCHAR(50) NOT NULL DEFAULT 'PASSED', -- 'PASSED', 'MANUAL_REVIEW_REQUIRED'
    evidence_start_time REAL,
    evidence_end_time REAL,
    raw_sentence TEXT,
    confidence_score REAL,
    raw_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_hash ON trades(file_hash);
CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_trades_confidence ON trades(confidence_flag);
CREATE INDEX IF NOT EXISTS idx_trades_action ON trades(action);

-- 4. DIRECT SQL AGGREGATE DASHBOARD REPORTING VIEW (Pure SQL, Zero LLM Hallucination)
CREATE OR REPLACE VIEW view_batch_audit_summary AS
SELECT
    c.batch_id,
    COUNT(DISTINCT c.file_hash) AS total_calls_ingested,
    COUNT(DISTINCT CASE WHEN c.processing_status = 'COMPLETED' THEN c.file_hash END) AS total_calls_completed,
    COUNT(DISTINCT CASE WHEN c.processing_status = 'FAILED' THEN c.file_hash END) AS total_calls_failed,
    COUNT(DISTINCT CASE WHEN t.trade_detected = TRUE THEN t.id END) AS total_trades_detected,
    COALESCE(SUM(CASE WHEN t.trade_detected = TRUE THEN t.quantity ELSE 0 END), 0) AS total_lots_traded,
    COUNT(DISTINCT CASE WHEN t.confidence_flag = 'MANUAL_REVIEW_REQUIRED' THEN t.id END) AS manual_review_flagged_count,
    ROUND(
        (COUNT(DISTINCT CASE WHEN t.confidence_flag = 'PASSED' THEN t.id END)::NUMERIC / 
         NULLIF(COUNT(DISTINCT CASE WHEN t.trade_detected = TRUE THEN t.id END), 0)) * 100.0, 
        2
    ) AS compliance_confidence_rate
FROM call_records c
LEFT JOIN trades t ON c.file_hash = t.file_hash
GROUP BY c.batch_id;

-- 5. EVIDENCE VERIFICATION VIEW (Full Traceability from Trade to Audio Timecode)
CREATE OR REPLACE VIEW view_trade_evidence_trail AS
SELECT 
    t.id AS trade_id,
    t.file_hash,
    t.file_name,
    t.ticker,
    t.instrument,
    t.strike_price,
    t.action,
    t.quantity,
    t.order_type,
    t.confidence_flag,
    t.evidence_start_time,
    t.evidence_end_time,
    t.raw_sentence,
    t.confidence_score,
    c.duration_seconds AS call_duration_sec,
    c.processing_status
FROM trades t
JOIN call_records c ON t.file_hash = c.file_hash
WHERE t.trade_detected = TRUE;

COMMIT;
