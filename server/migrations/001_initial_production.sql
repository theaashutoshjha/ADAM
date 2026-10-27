-- ==============================================================================
-- Migration: 001_initial_production.sql
-- ADAM-AR / AuditEQ Canonical Production Schema
-- Authoritative Specification: ARCHITECTURE.md §13-14 & PRD.md
-- Engine: PostgreSQL 15+ (with Foreign Keys, Enums, and Unique Constraints)
-- ==============================================================================

BEGIN;

-- 1. EXTENSIONS & DOMAINS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'compliance_admin', 'auditor', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE call_pipeline_state AS ENUM (
        'RECORDING_INGESTED',
        'CALL_ID_MATCHED',
        'MARKET_HOURS_FILTERED',
        'CUSTOMER_NUMBER_FILTERED',
        'ADVISOR_FILTERED',
        'TRADE_CANDIDATES_FOUND',
        'CLIENT_CODE_FILTERED',
        'PRE_ORDER_GROUPED',
        'PRE_ORDER_SELECTED',
        'TRADE_MATCHED',
        'TRANSCRIPTION_PENDING',
        'TRANSCRIBED',
        'AUDIT_PENDING',
        'AUDITED',
        'SCORING_PENDING',
        'SCORED',
        'SCORECARD_GENERATED',
        'RECONCILED',
        'COMPLETED',
        'RECONCILIATION_FAILED',
        'FAILED_NON_RETRYABLE',
        'AMBIGUOUS_MATCH',
        'EXCLUDED_NON_EQUITY',
        'SCRAP_CALL'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('PENDING', 'LEASED', 'COMPLETED', 'FAILED', 'DEAD_LETTER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE question_status AS ENUM ('PASS', 'FAIL', 'UNDETERMINED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE overall_status AS ENUM ('PASS', 'FATAL_FAIL', 'FAIL', 'UNDETERMINED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE timing_status AS ENUM ('VERIFIED_BEFORE', 'NOT_BEFORE', 'UNVERIFIABLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'auditor',
    is_active BOOLEAN NOT NULL DEFAULT true,
    token VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. FILE INTEGRITY & IMPORTS (Idempotency via SHA-256)
CREATE TABLE IF NOT EXISTS import_file (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'RECORDING_ZIP', 'CALL_METADATA', 'TRADE_BOOK', 'CLIENT_MASTER', 'ADVISOR_MASTER', 'MAIL_CONFIRMATION'
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    storage_path TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSED',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_import_hash UNIQUE (source_type, sha256)
);

-- 5. CALL METADATA (Col C: Call ID, Col E: Customer Number, Col J: Advisor, Col Q: Start Time)
CREATE TABLE IF NOT EXISTS call_metadata (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) NOT NULL,
    batch_id VARCHAR(100) NOT NULL,
    customer_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255),
    answered_by_agent VARCHAR(100),
    agent_number VARCHAR(50),
    call_start_time TIMESTAMPTZ,
    call_answered_time TIMESTAMPTZ,
    call_end_time TIMESTAMPTZ,
    conversation_duration_sec INT NOT NULL DEFAULT 0,
    recording_file_name VARCHAR(255),
    direction VARCHAR(20) DEFAULT 'INBOUND',
    status VARCHAR(50) DEFAULT 'Answered',
    raw_payload JSONB,
    superseded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_id_batchless ON call_metadata(call_id) WHERE NOT superseded;

-- 6. RECORDINGS (Audio Storage & Metadata)
CREATE TABLE IF NOT EXISTS call_recording (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) NOT NULL REFERENCES call_metadata(call_id) ON DELETE RESTRICT,
    file_name VARCHAR(255) NOT NULL,
    storage_key TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0.0,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'audio/wav',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. CLIENT MASTER (UCC & Registered Phones)
CREATE TABLE IF NOT EXISTS client_master (
    id SERIAL PRIMARY KEY,
    client_code VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    primary_mobile VARCHAR(50) NOT NULL,
    secondary_mobile VARCHAR(50),
    pan_number VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_master_phones ON client_master(primary_mobile, secondary_mobile);

-- 8. ADVISOR MASTER
CREATE TABLE IF NOT EXISTS advisor_master (
    id SERIAL PRIMARY KEY,
    advisor_code VARCHAR(50) UNIQUE NOT NULL,
    advisor_name VARCHAR(255) NOT NULL,
    agent_number VARCHAR(50),
    email VARCHAR(255),
    department VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TRADE BOOK (Authoritative Trades from Exchange/Backoffice)
CREATE TABLE IF NOT EXISTS trade (
    id SERIAL PRIMARY KEY,
    trade_key VARCHAR(100) NOT NULL, -- trade_id or row_hash
    batch_id VARCHAR(100) NOT NULL,
    client_code VARCHAR(50) NOT NULL,
    advisor_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    symbol VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    price NUMERIC(12, 4) NOT NULL,
    trade_date DATE NOT NULL,
    order_timestamp TIMESTAMPTZ NOT NULL,
    exchange VARCHAR(20) NOT NULL DEFAULT 'NSE',
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trade_key UNIQUE (trade_key)
);
CREATE INDEX IF NOT EXISTS idx_trades_matching ON trade(client_code, customer_phone, order_timestamp);

-- 10. PIPELINE CALL RECORD (The Active Audit Lifecycle)
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) UNIQUE NOT NULL,
    batch_id VARCHAR(100) NOT NULL,
    recording_file_name VARCHAR(255) NOT NULL,
    customer_number VARCHAR(50),
    advisor_name VARCHAR(255),
    client_code VARCHAR(50),
    call_start_time TIMESTAMPTZ,
    duration_sec REAL DEFAULT 0.0,
    pipeline_stage call_pipeline_state NOT NULL DEFAULT 'RECORDING_INGESTED',
    pipeline_status VARCHAR(50) NOT NULL DEFAULT 'PROCESSING',
    is_scrap BOOLEAN NOT NULL DEFAULT FALSE,
    scrap_reason TEXT,
    matched_trade_id INT REFERENCES trade(id) ON DELETE SET NULL,
    preorder_speaker VARCHAR(50),
    preorder_timestamp TIMESTAMPTZ,
    rule_set_version VARCHAR(50) NOT NULL DEFAULT 'v2.0-prod',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. CANDIDATE MATCHES & AUDIT HISTORY
CREATE TABLE IF NOT EXISTS call_trade_candidates (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) NOT NULL,
    trade_id INT NOT NULL REFERENCES trade(id) ON DELETE CASCADE,
    elimination_reason TEXT,
    is_selected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. TRANSCRIPTS & EVIDENCE-BEARING SEGMENTS (Deepgram Nova-3 Immutable)
CREATE TABLE IF NOT EXISTS transcript (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) UNIQUE NOT NULL,
    asr_provider VARCHAR(50) NOT NULL DEFAULT 'DEEPGRAM_NOVA_3',
    raw_response JSONB NOT NULL,
    full_text TEXT NOT NULL,
    language_code VARCHAR(20) DEFAULT 'en-IN',
    confidence REAL,
    provider_request_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcript_segment (
    id SERIAL PRIMARY KEY,
    transcript_id INT NOT NULL REFERENCES transcript(id) ON DELETE CASCADE,
    segment_id VARCHAR(50) NOT NULL,
    start_time_sec REAL NOT NULL,
    end_time_sec REAL NOT NULL,
    speaker VARCHAR(50) NOT NULL,
    text TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_text ON transcript_segment(transcript_id, start_time_sec);

-- 13. AUDITS & QUESTION RESULTS (Q1 - Q5)
CREATE TABLE IF NOT EXISTS audit (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) NOT NULL,
    run_no INT NOT NULL DEFAULT 1,
    rule_set_version VARCHAR(50) NOT NULL,
    model_version VARCHAR(100) NOT NULL,
    prompt_version VARCHAR(50) NOT NULL,
    status overall_status NOT NULL,
    score NUMERIC(5, 2) NOT NULL,
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_question_result (
    id SERIAL PRIMARY KEY,
    audit_id INT NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
    question_key VARCHAR(10) NOT NULL, -- 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'
    status question_status NOT NULL,
    evidence TEXT NOT NULL,
    speaker VARCHAR(50),
    segment_id VARCHAR(50),
    timestamp_sec REAL,
    timing_status timing_status NOT NULL DEFAULT 'UNVERIFIABLE',
    timing_basis VARCHAR(50) NOT NULL DEFAULT 'CALL_START_OFFSET',
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. AUTHORITATIVE SCORECARDS (Unique Current Per Call)
CREATE TABLE IF NOT EXISTS scorecard (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) NOT NULL,
    run_no INT NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    client_code VARCHAR(50),
    caller_name VARCHAR(255),
    customer_number VARCHAR(50),
    resolved_trade_id INT REFERENCES trade(id) ON DELETE SET NULL,
    q1_status question_status NOT NULL,
    q2_status question_status NOT NULL,
    q3_status question_status NOT NULL,
    q4_status question_status NOT NULL,
    q5_status question_status NOT NULL,
    overall_status overall_status NOT NULL,
    score NUMERIC(5, 2) NOT NULL,
    total_score NUMERIC(5, 2) NOT NULL,
    max_possible_score NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    score_details JSONB,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scorecard_current ON scorecard(call_id) WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scorecard_run ON scorecard(call_id, run_no);

-- 15. TRANSACTIONAL OUTBOX & AUDIT JOBS
CREATE TABLE IF NOT EXISTS outbox_event (
    id SERIAL PRIMARY KEY,
    event_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    topic VARCHAR(100) NOT NULL,
    call_id VARCHAR(100),
    run_no INT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_event(status, created_at);

CREATE TABLE IF NOT EXISTS audit_job (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) NOT NULL,
    run_no INT NOT NULL DEFAULT 1,
    job_type VARCHAR(50) NOT NULL, -- 'INGEST', 'TRANSCRIBE', 'AUDIT', 'SCORE', 'RECONCILE'
    state job_status NOT NULL DEFAULT 'PENDING',
    attempt INT NOT NULL DEFAULT 0,
    lease_owner VARCHAR(100),
    lease_expires_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_code VARCHAR(100),
    error_message_safe TEXT,
    CONSTRAINT uq_job_identity UNIQUE (call_id, run_no, job_type)
);

-- 16. INTEGRATION EVENTS (Tata CloudPhone Webhook Deduplication)
CREATE TABLE IF NOT EXISTS integration_event (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL, -- 'TATA_CLOUDPHONE'
    provider_event_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_integration_event UNIQUE (provider, provider_event_id)
);

-- 17. AUDIT TRAIL (Append-Only Immutable Event Sourcing)
CREATE TABLE IF NOT EXISTS audit_trail_event (
    id SERIAL PRIMARY KEY,
    actor_id INT,
    actor_username VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. RULE-SETS & CONFIGURATION
CREATE TABLE IF NOT EXISTS rule_set (
    id VARCHAR(100) PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    parameters JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ
);

COMMIT;
