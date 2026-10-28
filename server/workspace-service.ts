// =============================================================
// AuditEQ — Workspace & Multi-Database Isolation Service
// Provides 9 isolated workspaces with distinct SQLite databases,
// preventing data collision across logins.
// Supports up to 50 custom parameters, subparameters, & fatal rules.
// =============================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CUSTOMER_SUPPORT_PARAMETERS,
  MUTUAL_FUND_PARAMETERS,
  EQUITY_REGULAR_PARAMETERS,
} from './workspace-parameters-def';

export interface WorkspaceSubparameter {
  id: string;
  title: string;
  description?: string;
  weight?: number;
  mandatory?: boolean;
}

export interface WorkspaceParameter {
  id: number;
  param_key: string;
  title: string;
  category: string;
  question: string;
  fatal: boolean;
  weight: number;
  rule?: string;
  subparameters: WorkspaceSubparameter[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceUserDef {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: string;
}

export interface WorkspaceDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: 'equity' | 'mutual_fund' | 'support' | 'system_admin';
  dbFileName: string;
  defaultUser: WorkspaceUserDef;
  additionalUsers?: WorkspaceUserDef[];
  starterParameters: Array<{
    param_key: string;
    title: string;
    category: string;
    question: string;
    fatal: boolean;
    weight: number;
    rule: string;
    subparameters: WorkspaceSubparameter[];
  }>;
}

// -------------------------------------------------------------
// The 10 Authoritative Workspaces Definition
// -------------------------------------------------------------
export const WORKSPACES: WorkspaceDefinition[] = [
  // 1. Pre-order Regulatory Desk (Equity)
  {
    id: 'preorder_desk',
    name: 'Pre-order Regulatory Desk',
    tagline: 'SEBI Voice Mandate Compliance',
    description: 'SEBI Regulatory Pre-Order Voice & Quality Audit Engine (Untouched primary system)',
    category: 'equity',
    dbFileName: 'auditeq_production.db',
    defaultUser: {
      username: 'ashutosh.kumar@fundsindia.com',
      email: 'ashutosh.kumar@fundsindia.com',
      full_name: 'Ashutosh Kumar',
      password: process.env.ADMIN_PASSWORD || 'Fi*119147',
      role: 'Quality',
    },
    starterParameters: [
      {
        param_key: 'Q1',
        title: 'Registered Mobile Number Verification',
        category: 'Regulatory',
        question: "Confirmation given in the Customer's Registered / authorised Number?",
        fatal: true,
        weight: 20,
        rule: 'PASS when calling number matches registered/authorized number from trade data. Mismatched contact is fatal.',
        subparameters: [
          { id: 'q1_sub1', title: 'CLI / Inbound Caller Number Match', description: 'Caller ID verified against CRM registered contact', mandatory: true },
          { id: 'q1_sub2', title: 'Secondary Authorized Mobile Check', description: 'Cross-checked with power of attorney / mandate phone list', mandatory: false },
        ],
      },
      {
        param_key: 'Q2',
        title: 'Pre-Order Timing Norms',
        category: 'Regulatory',
        question: 'Pre Order Confirmation is as per the Regulatory Norms?',
        fatal: true,
        weight: 20,
        rule: 'PASS when call authorization preceded order placement timestamp in exchange logs.',
        subparameters: [
          { id: 'q2_sub1', title: 'Timestamp Chronology Pre-Order Check', description: 'Call end time prior to trade order dispatch time', mandatory: true },
        ],
      },
      {
        param_key: 'Q3',
        title: 'Scrip, Price & Quantity Disclosure',
        category: 'Trade Details',
        question: 'Was Scrip, price and quantity clearly mentioned and agreed?',
        fatal: false,
        weight: 20,
        rule: 'PASS when scrip/stock name, execution price (or CMP/market), and quantity are articulated.',
        subparameters: [
          { id: 'q3_sub1', title: 'Exact Scrip / Symbol Stated', description: 'Full company stock name or NSE/BSE symbol', mandatory: true },
          { id: 'q3_sub2', title: 'Price Explicitly Stated or CMP Agreed', description: 'Specified limit price or verbal market order acceptance', mandatory: true },
          { id: 'q3_sub3', title: 'Total Volume / Quantity Confirmed', description: 'Number of equity shares explicitly acknowledged', mandatory: true },
        ],
      },
      {
        param_key: 'Q4',
        title: 'Customer Affirmative Acknowledgment',
        category: 'Customer Consent',
        question: 'Customer Acknowledge and affirm the order instruction?',
        fatal: false,
        weight: 20,
        rule: 'PASS when customer gives unambiguous verbal consent or authorization.',
        subparameters: [
          { id: 'q4_sub1', title: 'Direct Verbal Consent', description: 'Explicit "yes", "proceed", or "place order"', mandatory: true },
        ],
      },
      {
        param_key: 'Q5',
        title: 'Zero Return Commitment Guarantee',
        category: 'Compliance Integrity',
        question: "Wasn't there any Return Commitment or Profit Guarantee?",
        fatal: true,
        weight: 20,
        rule: 'PASS if advisor gave zero profit assurances. FAIL (FATAL) if returns were promised.',
        subparameters: [
          { id: 'q5_sub1', title: 'No Guaranteed Return Claims', description: 'Zero promises of fixed percentage profit or risk-free upside', mandatory: true },
          { id: 'q5_sub2', title: 'Market Risk Disclosure Made', description: 'Standard advisory risk disclaimer communicated', mandatory: false },
        ],
      },
    ],
  },

  // 2. Customer Support (Support) - Call Audit Quality Scorecard (Image 2)
  {
    id: 'customer_support',
    name: 'Customer Support',
    tagline: 'Support Call Audit Quality Desk',
    description: 'Customer Support 5-mark Call Quality & Resolution Audit Scorecard',
    category: 'support',
    dbFileName: 'customer_support.db',
    defaultUser: {
      username: 'dharanieshwar.a@fundsindia.com',
      email: 'dharanieshwar.a@fundsindia.com',
      full_name: 'Dharanieshwar A',
      password: 'Support@Secure#92',
      role: 'Quality',
    },
    starterParameters: CUSTOMER_SUPPORT_PARAMETERS,
  },

  // 3. MF Gold (Mutual Fund) - Call Audit Quality Scorecard (Image 3)
  {
    id: 'mf_gold',
    name: 'MF Gold',
    tagline: 'Gold Wealth Advisory Quality Scorecard',
    description: 'Mutual Fund Gold Tier 5-mark Quality & Advisory Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_gold.db',
    defaultUser: {
      username: 'asina.banu@fundsindia.com',
      email: 'asina.banu@fundsindia.com',
      full_name: 'Asina Banu',
      password: 'GoldAdvisory*83$',
      role: 'Quality',
    },
    starterParameters: MUTUAL_FUND_PARAMETERS,
  },

  // 4. MF Silver (Mutual Fund) - Call Audit Quality Scorecard (Image 3)
  {
    id: 'mf_silver',
    name: 'MF Silver',
    tagline: 'Silver Wealth Advisory Quality Scorecard',
    description: 'Mutual Fund Silver Tier 5-mark Quality & Advisory Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_silver.db',
    defaultUser: {
      username: 'asina.banu@fundsindia.com#mf_silver',
      email: 'asina.banu@fundsindia.com',
      full_name: 'Asina Banu',
      password: 'SilverWealth#47!',
      role: 'Quality',
    },
    starterParameters: MUTUAL_FUND_PARAMETERS,
  },

  // 5. MF Digital (Mutual Fund) - Call Audit Quality Scorecard (Image 3)
  {
    id: 'mf_digital',
    name: 'MF Digital',
    tagline: 'Digital Operations & App Support QA',
    description: 'Mutual Fund Digital Operations 5-mark Quality Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_digital.db',
    defaultUser: {
      username: 'meenatchi.r@fundsindia.com',
      email: 'meenatchi.r@fundsindia.com',
      full_name: 'Meenatchi R',
      password: 'DigitalOps@61&',
      role: 'Quality',
    },
    additionalUsers: [
      {
        username: 'rajesh.chakravarthi@fundsindia.com',
        email: 'rajesh.chakravarthi@fundsindia.com',
        full_name: 'Rajesh Chakravarthi Rao',
        password: 'DigitalOps@61&',
        role: 'Quality',
      },
    ],
    starterParameters: MUTUAL_FUND_PARAMETERS,
  },

  // 6. MF Onboarding (Mutual Fund) - Call Audit Quality Scorecard (Image 3)
  {
    id: 'mf_onboarding',
    name: 'MF Onboarding',
    tagline: 'KYC & Client Onboarding Quality QA',
    description: 'Mutual Fund Onboarding 5-mark Quality Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_onboarding.db',
    defaultUser: {
      username: 'meenatchi.r@fundsindia.com#mf_onboarding',
      email: 'meenatchi.r@fundsindia.com',
      full_name: 'Meenatchi R',
      password: 'OnboardKyc*35^',
      role: 'Quality',
    },
    additionalUsers: [
      {
        username: 'rajesh.chakravarthi@fundsindia.com#mf_onboarding',
        email: 'rajesh.chakravarthi@fundsindia.com',
        full_name: 'Rajesh Chakravarthi Rao',
        password: 'OnboardKyc*35^',
        role: 'Quality',
      },
    ],
    starterParameters: MUTUAL_FUND_PARAMETERS,
  },

  // 7. Equity Onboarding (Equity) - Call Audit Quality Scorecard (Image 4)
  {
    id: 'equity_onboarding',
    name: 'Equity Onboarding',
    tagline: 'Demat Onboarding Verification QA',
    description: 'Equity Demat & Trading Onboarding 5-mark Quality Audit Desk',
    category: 'equity',
    dbFileName: 'equity_onboarding.db',
    defaultUser: {
      username: 'dharanieshwar.a@fundsindia.com#equity_onboarding',
      email: 'dharanieshwar.a@fundsindia.com',
      full_name: 'Dharanieshwar A',
      password: 'EqDemat#74$',
      role: 'Quality',
    },
    starterParameters: EQUITY_REGULAR_PARAMETERS,
  },

  // 8. Equity Regular (Equity) - Call Audit Quality Scorecard (Image 4)
  {
    id: 'equity_regular',
    name: 'Equity Regular',
    tagline: 'Equity Broking Quality Scorecard',
    description: 'Equity Regular Trading & Advisory 5-mark Quality Audit Desk',
    category: 'equity',
    dbFileName: 'equity_regular.db',
    defaultUser: {
      username: 'ashutosh.kumar@fundsindia.com#equity_regular',
      email: 'ashutosh.kumar@fundsindia.com',
      full_name: 'Ashutosh Kumar',
      password: 'EqTrader@58!',
      role: 'Quality',
    },
    starterParameters: EQUITY_REGULAR_PARAMETERS,
  },

  // 9. MF Platinum (Mutual Fund) - Call Audit Quality Scorecard (Image 3)
  {
    id: 'mf_platinum',
    name: 'MF Platinum',
    tagline: 'Platinum HNI Wealth Advisory QA',
    description: 'Mutual Fund Platinum HNI 5-mark Quality & Advisory Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_platinum.db',
    defaultUser: {
      username: 'ashwini.prabhu@fundsindia.com',
      email: 'ashwini.prabhu@fundsindia.com',
      full_name: 'Ashwini Prabhu N N',
      password: 'PlatinumHni*19#',
      role: 'Quality',
    },
    starterParameters: MUTUAL_FUND_PARAMETERS,
  },

  // 10. Global Compliance Administrator (System Admin) - Multi-DB / Switchable
  {
    id: 'compliance_admin',
    name: 'Global Compliance Administrator',
    tagline: 'Multi-Workspace Supervision & Audit Governance',
    description: 'Global Compliance Administrator Multi-DB Switchable Management Console',
    category: 'system_admin',
    dbFileName: 'auditeq_production.db',
    defaultUser: {
      username: 'ashwini.prabhu@fundsindia.com#compliance_admin',
      email: 'ashwini.prabhu@fundsindia.com',
      full_name: 'Ashwini Prabhu N N',
      password: 'Admin*119147',
      role: 'admin',
    },
    additionalUsers: [
      {
        username: 'ashutosh.kumar@fundsindia.com#compliance_admin',
        email: 'ashutosh.kumar@fundsindia.com',
        full_name: 'Ashutosh Kumar',
        password: 'Admin*119147',
        role: 'admin',
      },
    ],
    starterParameters: CUSTOMER_SUPPORT_PARAMETERS,
  },
];

// -------------------------------------------------------------
// Database Connection Pool & AsyncLocalStorage
// -------------------------------------------------------------
const workspaceConnections = new Map<string, DatabaseSync>();
export const workspaceAsyncStorage = new AsyncLocalStorage<DatabaseSync>();
export const currentWorkspaceIdStorage = new AsyncLocalStorage<string>();

const WORKSPACES_DIR = path.join(process.cwd(), '.data', 'workspaces');

export function getWorkspacesDir(): string {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
  return WORKSPACES_DIR;
}

export function getWorkspaceById(id: string): WorkspaceDefinition | undefined {
  return WORKSPACES.find((w) => w.id === id);
}

export function getWorkspaceByEmailOrUsername(identifier: string): WorkspaceDefinition | undefined {
  const clean = identifier.trim().toLowerCase();
  return WORKSPACES.find(
    (w) =>
      w.defaultUser.username.toLowerCase() === clean ||
      w.defaultUser.email.toLowerCase() === clean ||
      w.id.toLowerCase() === clean
  );
}

// -------------------------------------------------------------
// Schema Initialization for an Isolated Workspace Database
// -------------------------------------------------------------
export function ensureWorkspaceSchema(db: DatabaseSync, workspaceId: string): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 60000;
    PRAGMA cache_size = -64000;

    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      recording_name TEXT NOT NULL,
      recording_url TEXT,
      storage_path TEXT,
      file_sha256 TEXT,
      dealer TEXT,
      caller_name TEXT,
      team TEXT,
      client TEXT,
      client_number TEXT,
      phone_number TEXT,
      calling_number TEXT,
      registered_number TEXT,
      authorized_numbers TEXT,
      agent_number TEXT,
      call_date TEXT,
      call_time TEXT,
      duration_seconds INTEGER DEFAULT 0,
      source TEXT DEFAULT 'upload',
      status TEXT DEFAULT 'imported',
      call_type TEXT DEFAULT 'unknown',
      preorder_confidence REAL,
      preorder_evidence TEXT,
      transcript TEXT,
      transcript_raw TEXT,
      transcript_meta TEXT,
      transcript_model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      preorder_speaker TEXT,
      preorder_timestamp TEXT,
      pipeline_stage TEXT,
      pipeline_status TEXT,
      pipeline_error TEXT,
      batch_id TEXT,
      original_filename TEXT,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT,
      import_status TEXT DEFAULT "CONFIRMED",
      identity_status TEXT DEFAULT "PENDING",
      identity_source TEXT,
      client_code TEXT,
      transcript_status TEXT DEFAULT "PENDING",
      classification TEXT DEFAULT "PENDING",
      classification_confidence REAL,
      classification_evidence TEXT,
      trade_match_status TEXT DEFAULT "PENDING",
      matched_trade_id INTEGER,
      trade_match_confidence REAL,
      trade_match_margin REAL,
      trade_match_reason TEXT,
      total_orders_count INTEGER DEFAULT 0,
      total_executions_count INTEGER DEFAULT 0,
      total_matched_quantity INTEGER DEFAULT 0,
      audit_status TEXT DEFAULT "PENDING",
      processing_status TEXT DEFAULT "IDLE",
      failure_reason TEXT,
      scrap_reason TEXT,
      classification_reason TEXT,
      audit_notes TEXT,
      current_gate TEXT,
      gate_reason TEXT,
      retry_count INTEGER DEFAULT 0,
      review_resolution TEXT,
      review_resolved_by INTEGER,
      review_resolved_at TEXT,
      review_resolution_notes TEXT,
      dealer_name TEXT,
      advisor_name TEXT,
      customer_number TEXT,
      caller_id TEXT,
      canonical_call_id TEXT,
      symbol TEXT,
      spoken_language TEXT
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      dealer TEXT,
      advisor_name TEXT,
      team TEXT,
      trade_date TEXT,
      trade_time TEXT,
      client TEXT,
      client_number TEXT,
      phone_number TEXT,
      symbol TEXT,
      side TEXT,
      quantity REAL,
      price REAL,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      price_display TEXT DEFAULT "CMP",
      is_combined INTEGER DEFAULT 0,
      split_count INTEGER DEFAULT 1,
      notes TEXT,
      dealer_name TEXT,
      client_code TEXT,
      order_date TEXT,
      customer_number TEXT,
      status TEXT,
      matched_call_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NOT NULL,
      trade_id INTEGER NOT NULL,
      confidence REAL NOT NULL,
      second_confidence REAL,
      score_margin REAL,
      reason TEXT,
      status TEXT DEFAULT 'matched',
      manual_override INTEGER DEFAULT 0,
      reviewed_by INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_call_key INTEGER,
      call_id INTEGER NOT NULL,
      trade_id INTEGER,
      match_id INTEGER,
      trade_context TEXT,
      transcript_snapshot TEXT,
      compliance_disposition TEXT,
      rubric_version TEXT,
      rubric_snapshot TEXT,
      prompt_version TEXT,
      model TEXT,
      scoring_version TEXT,
      q1 TEXT, q1_flag TEXT, q1_evidence TEXT, q1_confidence REAL,
      q1_start_ms INTEGER, q1_end_ms INTEGER, q1_speaker TEXT,
      q2 TEXT, q2_flag TEXT, q2_evidence TEXT, q2_confidence REAL,
      q2_start_ms INTEGER, q2_end_ms INTEGER, q2_speaker TEXT,
      q3 TEXT, q3_flag TEXT, q3_evidence TEXT, q3_confidence REAL,
      q3_start_ms INTEGER, q3_end_ms INTEGER, q3_speaker TEXT,
      q4 TEXT, q4_flag TEXT, q4_evidence TEXT, q4_confidence REAL,
      q4_start_ms INTEGER, q4_end_ms INTEGER, q4_speaker TEXT,
      q5 TEXT, q5_flag TEXT, q5_evidence TEXT, q5_confidence REAL,
      q5_start_ms INTEGER, q5_end_ms INTEGER, q5_speaker TEXT,
      score REAL,
      audit_comment TEXT,
      status TEXT DEFAULT 'audited',
      transcript_hash TEXT,
      evidence_bundle_hash TEXT,
      audit_input_hash TEXT,
      pipeline_run_id TEXT,
      human_review_reason TEXT,
      reviewed_by INTEGER,
      reviewed_at TEXT,
      email_sent_at TEXT,
      email_attempts INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scorecards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id INTEGER NOT NULL,
      call_id INTEGER NOT NULL,
      caller_name TEXT,
      dealer TEXT,
      team TEXT,
      client TEXT,
      trade_phone TEXT,
      calling_number TEXT,
      registered_number TEXT,
      trade_date TEXT,
      call_date TEXT,
      score REAL NOT NULL,
      is_fatal INTEGER DEFAULT 0,
      fatal_reasons TEXT,
      q1_status TEXT, q1_evidence TEXT,
      q2_status TEXT, q2_evidence TEXT,
      q3_status TEXT, q3_evidence TEXT,
      q4_status TEXT, q4_evidence TEXT,
      q5_status TEXT, q5_evidence TEXT,
      audit_comment TEXT,
      generated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      client_code TEXT,
      resolved_trade_id INTEGER,
      is_current INTEGER DEFAULT 1,
      run_no INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS call_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      speaker INTEGER,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS call_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      speaker INTEGER,
      confidence REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS call_orders (
      id TEXT PRIMARY KEY,
      call_id INTEGER NOT NULL,
      client_code TEXT,
      symbol TEXT,
      quantity INTEGER,
      price REAL,
      order_type TEXT,
      confidence REAL,
      raw_text TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_executions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      trade_id INTEGER NOT NULL,
      matched_quantity INTEGER NOT NULL,
      confidence REAL NOT NULL,
      margin REAL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rule_sets (
      version TEXT PRIMARY KEY,
      effective_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      topic TEXT NOT NULL,
      call_id INTEGER,
      run_no INTEGER DEFAULT 1,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS import_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      status TEXT DEFAULT 'PROCESSED',
      error_message TEXT,
      created_at TEXT NOT NULL,
      CONSTRAINT uq_import_hash UNIQUE (source_type, sha256)
    );

    CREATE TABLE IF NOT EXISTS integration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'RECEIVED',
      created_at TEXT NOT NULL,
      CONSTRAINT uq_integration_event UNIQUE (provider, provider_event_id)
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      email_id TEXT PRIMARY KEY,
      audit_id TEXT,
      scorecard_id INTEGER,
      advisor_id TEXT,
      recipient TEXT NOT NULL,
      email_type TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      status TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 0,
      provider_message_id TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      failed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_code TEXT UNIQUE NOT NULL,
      name TEXT,
      phone_number TEXT,
      registered_mobile TEXT,
      email TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS advisors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      advisor_code TEXT UNIQUE NOT NULL,
      advisor_name TEXT NOT NULL,
      agent_number TEXT,
      email TEXT,
      department TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      event TEXT NOT NULL DEFAULT 'system',
      message TEXT NOT NULL,
      context TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      timestamp TEXT,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scorecard_id INTEGER,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT,
      subject TEXT,
      status TEXT NOT NULL,
      message_id TEXT,
      error_message TEXT,
      sent_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      records_count INTEGER NOT NULL,
      sha256_hash TEXT NOT NULL,
      archive_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Dedicated Custom Parameters & Subparameters Table (Up to 50 parameters)
    CREATE TABLE IF NOT EXISTS workspace_parameters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      param_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      question TEXT NOT NULL,
      fatal INTEGER DEFAULT 0,
      weight REAL DEFAULT 10.0,
      rule TEXT,
      subparameters TEXT,
      display_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Ensure all migration columns exist for existing tables
  const addCol = (tbl: string, col: string, def: string) => {
    try { db.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def};`); } catch {}
  };

  // Calls columns migration
  const callCols: [string, string][] = [
    ['preorder_speaker', 'TEXT'],
    ['preorder_timestamp', 'TEXT'],
    ['pipeline_stage', 'TEXT'],
    ['pipeline_status', 'TEXT'],
    ['pipeline_error', 'TEXT'],
    ['batch_id', 'TEXT'],
    ['original_filename', 'TEXT'],
    ['file_size', 'INTEGER DEFAULT 0'],
    ['mime_type', 'TEXT'],
    ['import_status', 'TEXT DEFAULT "CONFIRMED"'],
    ['identity_status', 'TEXT DEFAULT "PENDING"'],
    ['identity_source', 'TEXT'],
    ['client_code', 'TEXT'],
    ['transcript_status', 'TEXT DEFAULT "PENDING"'],
    ['classification', 'TEXT DEFAULT "PENDING"'],
    ['classification_confidence', 'REAL'],
    ['classification_evidence', 'TEXT'],
    ['trade_match_status', 'TEXT DEFAULT "PENDING"'],
    ['matched_trade_id', 'INTEGER'],
    ['trade_match_confidence', 'REAL'],
    ['trade_match_margin', 'REAL'],
    ['trade_match_reason', 'TEXT'],
    ['total_orders_count', 'INTEGER DEFAULT 0'],
    ['total_executions_count', 'INTEGER DEFAULT 0'],
    ['total_matched_quantity', 'INTEGER DEFAULT 0'],
    ['audit_status', 'TEXT DEFAULT "PENDING"'],
    ['processing_status', 'TEXT DEFAULT "IDLE"'],
    ['failure_reason', 'TEXT'],
    ['scrap_reason', 'TEXT'],
    ['classification_reason', 'TEXT'],
    ['audit_notes', 'TEXT'],
    ['current_gate', 'TEXT'],
    ['gate_reason', 'TEXT'],
    ['retry_count', 'INTEGER DEFAULT 0'],
    ['review_resolution', 'TEXT'],
    ['review_resolved_by', 'INTEGER'],
    ['review_resolved_at', 'TEXT'],
    ['review_resolution_notes', 'TEXT'],
    ['dealer_name', 'TEXT'],
    ['advisor_name', 'TEXT'],
    ['customer_number', 'TEXT'],
    ['caller_id', 'TEXT'],
    ['canonical_call_id', 'TEXT'],
    ['symbol', 'TEXT'],
    ['spoken_language', 'TEXT'],
  ];
  for (const [c, d] of callCols) addCol('calls', c, d);

  // Scorecards columns migration
  const scCols: [string, string][] = [
    ['updated_at', 'TEXT'],
    ['client_code', 'TEXT'],
    ['resolved_trade_id', 'INTEGER'],
    ['is_current', 'INTEGER DEFAULT 1'],
    ['run_no', 'INTEGER DEFAULT 1'],
  ];
  for (const [c, d] of scCols) addCol('scorecards', c, d);

  // Audits columns migration
  const auditCols: [string, string][] = [
    ['transcript_hash', 'TEXT'],
    ['evidence_bundle_hash', 'TEXT'],
    ['audit_input_hash', 'TEXT'],
    ['pipeline_run_id', 'TEXT'],
    ['human_review_reason', 'TEXT'],
    ['reviewed_by', 'INTEGER'],
    ['reviewed_at', 'TEXT'],
    ['email_sent_at', 'TEXT'],
    ['email_attempts', 'INTEGER DEFAULT 0'],
  ];
  for (const [c, d] of auditCols) addCol('audits', c, d);

  // Trades columns migration
  const tradeCols: [string, string][] = [
    ['price_display', 'TEXT DEFAULT "CMP"'],
    ['is_combined', 'INTEGER DEFAULT 0'],
    ['split_count', 'INTEGER DEFAULT 1'],
    ['notes', 'TEXT'],
    ['dealer_name', 'TEXT'],
    ['client_code', 'TEXT'],
    ['order_date', 'TEXT'],
    ['customer_number', 'TEXT'],
    ['status', 'TEXT'],
    ['matched_call_id', 'INTEGER'],
  ];
  for (const [c, d] of tradeCols) addCol('trades', c, d);

  // Matches columns migration
  const matchCols: [string, string][] = [
    ['verification_status', 'TEXT DEFAULT "confirmed"'],
    ['updated_at', 'TEXT'],
  ];
  for (const [c, d] of matchCols) addCol('matches', c, d);

  // Logs columns migration
  const logCols: [string, string][] = [
    ['event', 'TEXT DEFAULT "system"'],
    ['context', 'TEXT'],
    ['created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP'],
    ['timestamp', 'TEXT'],
    ['category', 'TEXT'],
  ];
  for (const [c, d] of logCols) addCol('logs', c, d);

  // Create high-performance database indexes
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_calls_call_date ON calls(call_date);
      CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
      CREATE INDEX IF NOT EXISTS idx_calls_classification ON calls(classification);
      CREATE INDEX IF NOT EXISTS idx_calls_client_code ON calls(client_code);
      CREATE INDEX IF NOT EXISTS idx_scorecards_call_id ON scorecards(call_id);
      CREATE INDEX IF NOT EXISTS idx_scorecards_client_code ON scorecards(client_code);
      CREATE INDEX IF NOT EXISTS idx_trades_client ON trades(client);
      CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date);
      CREATE INDEX IF NOT EXISTS idx_matches_call_id ON matches(call_id);
      CREATE INDEX IF NOT EXISTS idx_matches_trade_id ON matches(trade_id);
      CREATE INDEX IF NOT EXISTS idx_audits_call_id ON audits(call_id);
    `);
  } catch {}

  // Initialize or refresh starter parameters to match official quality scorecard rubrics
  const wsDef = getWorkspaceById(workspaceId);
  if (wsDef && wsDef.starterParameters && wsDef.starterParameters.length > 0) {
    const existingParams = db.prepare('SELECT param_key FROM workspace_parameters').all() as Array<{ param_key: string }>;
    const officialKeys = new Set(wsDef.starterParameters.map((p) => p.param_key));
    const isOutdated = existingParams.length === 0 || !existingParams.some((p) => officialKeys.has(p.param_key));

    if (isOutdated) {
      try {
        db.prepare('DELETE FROM workspace_parameters').run();
        const now = new Date().toISOString();
        const insertStmt = db.prepare(`
          INSERT INTO workspace_parameters (param_key, title, category, question, fatal, weight, rule, subparameters, display_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        wsDef.starterParameters.forEach((p, idx) => {
          try {
            insertStmt.run(
              p.param_key,
              p.title,
              p.category,
              p.question,
              p.fatal ? 1 : 0,
              p.weight,
              p.rule,
              JSON.stringify(p.subparameters || []),
              idx + 1,
              now,
              now
            );
          } catch {
            // ignore unique constraint
          }
        });
      } catch (err: any) {
        console.warn(`[Workspace] Notice seeding parameters for "${workspaceId}":`, err?.message);
      }
    }
  }
}

// -------------------------------------------------------------
// Workspace Initialization & Connection Factory
// -------------------------------------------------------------
export function initAllWorkspaces(primarySqlite: DatabaseSync): void {
  const dir = getWorkspacesDir();

  // Register primary database connection
  workspaceConnections.set('preorder_desk', primarySqlite);

  // Ensure workspace_parameters and users table exist in primary database
  try {
    primarySqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        full_name TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Quality',
        token TEXT,
        token_expires_at TEXT,
        workspace_id TEXT DEFAULT 'preorder_desk',
        created_at TEXT NOT NULL
      );
    `);
  } catch {}

  try {
    ensureWorkspaceSchema(primarySqlite, 'preorder_desk');
  } catch (err: any) {
    console.warn('[Workspace] Primary DB schema notice:', err?.message);
  }

  // Ensure workspace_id column exists on primary users table
  try {
    primarySqlite.exec('ALTER TABLE users ADD COLUMN workspace_id TEXT DEFAULT "preorder_desk";');
  } catch {
    // Column already exists
  }

  // Initialize all remaining workspace databases
  for (const ws of WORKSPACES) {
    if (ws.id === 'preorder_desk') continue;

    const dbPath = path.join(dir, ws.dbFileName);
    const wsDb = new DatabaseSync(dbPath);
    ensureWorkspaceSchema(wsDb, ws.id);
    workspaceConnections.set(ws.id, wsDb);
  }

  // Provision user accounts for all 10 desks in primary users table
  provisionWorkspaceUsers(primarySqlite);
}

function hashUserPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function provisionWorkspaceUsers(primarySqlite: DatabaseSync): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  for (const ws of WORKSPACES) {
    const usersToProvision = [ws.defaultUser, ...(ws.additionalUsers || [])];

    for (const u of usersToProvision) {
      const cleanEmail = u.email.trim().toLowerCase();
      const cleanUsername = u.username.trim().toLowerCase();

      // Check if user account exists for this specific workspace
      const existing = primarySqlite
        .prepare('SELECT id, workspace_id FROM users WHERE workspace_id = ? AND (LOWER(email) = ? OR LOWER(username) = ?)')
        .get(ws.id, cleanEmail, cleanUsername) as { id: number; workspace_id?: string } | undefined;

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashUserPassword(u.password, salt);

      if (existing) {
        primarySqlite
          .prepare('UPDATE users SET username = ?, email = ?, full_name = ?, role = ?, workspace_id = ?, password_hash = ?, salt = ? WHERE id = ?')
          .run(cleanUsername, cleanEmail, u.full_name, u.role, ws.id, hash, salt, existing.id);
      } else {
        try {
          primarySqlite
            .prepare(`
              INSERT INTO users (username, email, full_name, password_hash, salt, role, workspace_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(cleanUsername, cleanEmail, u.full_name, hash, salt, u.role, ws.id, now);
        } catch {
          // If username uniqueness collision, qualify username with workspace
          const qualifiedUsername = `${cleanUsername}#${ws.id}`;
          primarySqlite
            .prepare(`
              INSERT OR REPLACE INTO users (username, email, full_name, password_hash, salt, role, workspace_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(qualifiedUsername, cleanEmail, u.full_name, hash, salt, u.role, ws.id, now);
        }
      }
    }
  }
}

export function getWorkspaceDb(workspaceId: string): DatabaseSync {
  const existing = workspaceConnections.get(workspaceId);
  if (existing) return existing;

  const wsDef = getWorkspaceById(workspaceId);
  if (!wsDef || wsDef.id === 'preorder_desk') {
    return workspaceConnections.get('preorder_desk')!;
  }

  const dbPath = path.join(getWorkspacesDir(), wsDef.dbFileName);
  const newDb = new DatabaseSync(dbPath);
  ensureWorkspaceSchema(newDb, wsDef.id);
  workspaceConnections.set(wsDef.id, newDb);
  return newDb;
}

export function getEffectiveDb(fallbackDb: DatabaseSync): DatabaseSync {
  return workspaceAsyncStorage.getStore() || fallbackDb;
}

export function getEffectiveWorkspaceId(): string {
  return currentWorkspaceIdStorage.getStore() || 'preorder_desk';
}

// -------------------------------------------------------------
// Transparent Proxy over SQLite: Routes dynamically to the
// current request's isolated workspace database
// -------------------------------------------------------------
export function createWorkspaceDbProxy(primarySqlite: DatabaseSync): DatabaseSync {
  return new Proxy(primarySqlite, {
    get(target, prop, receiver) {
      const activeDb = workspaceAsyncStorage.getStore() || primarySqlite;
      const val = Reflect.get(activeDb, prop, activeDb);
      if (typeof val === 'function') {
        return val.bind(activeDb);
      }
      return val;
    },
  });
}

// -------------------------------------------------------------
// Custom Parameter CRUD (Enforces <= 50 parameters per workspace)
// -------------------------------------------------------------
export function getWorkspaceParameters(db: DatabaseSync): WorkspaceParameter[] {
  try {
    const rows = db
      .prepare('SELECT * FROM workspace_parameters ORDER BY display_order ASC, id ASC')
      .all() as any[];

    return rows.map((r) => {
      let subparams: WorkspaceSubparameter[] = [];
      try {
        if (r.subparameters) {
          subparams = typeof r.subparameters === 'string' ? JSON.parse(r.subparameters) : r.subparameters;
        }
      } catch {
        subparams = [];
      }

      return {
        id: r.id,
        param_key: r.param_key,
        title: r.title,
        category: r.category || 'General',
        question: r.question,
        fatal: Boolean(r.fatal),
        weight: Number(r.weight || 10),
        rule: r.rule || '',
        subparameters: Array.isArray(subparams) ? subparams : [],
        display_order: Number(r.display_order || 0),
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });
  } catch (err: any) {
    console.error('[getWorkspaceParameters] Error:', err?.message);
    return [];
  }
}

export function createWorkspaceParameter(
  db: DatabaseSync,
  param: {
    param_key?: string;
    title: string;
    category?: string;
    question: string;
    fatal?: boolean;
    weight?: number;
    rule?: string;
    subparameters?: WorkspaceSubparameter[];
  }
): { ok: boolean; parameter?: WorkspaceParameter; error?: string } {
  try {
    // Check limit of 50 parameters
    const countRow = db.prepare('SELECT count(*) as c FROM workspace_parameters').get() as { c: number };
    const currentCount = countRow?.c || 0;
    if (currentCount >= 50) {
      return {
        ok: false,
        error: 'Maximum limit of 50 parameters reached for this workspace. Delete or edit existing parameters.',
      };
    }

    if (!param.title || !param.title.trim()) {
      return { ok: false, error: 'Parameter title is required.' };
    }
    if (!param.question || !param.question.trim()) {
      return { ok: false, error: 'Parameter question / evaluation criteria is required.' };
    }

    const nextIndex = currentCount + 1;
    const cleanKey =
      param.param_key && param.param_key.trim()
        ? param.param_key.trim().toUpperCase()
        : `P${String(nextIndex).padStart(2, '0')}`;

    const now = new Date().toISOString();
    const result = db
      .prepare(`
        INSERT INTO workspace_parameters (param_key, title, category, question, fatal, weight, rule, subparameters, display_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        cleanKey,
        param.title.trim(),
        (param.category || 'General').trim(),
        param.question.trim(),
        param.fatal ? 1 : 0,
        param.weight !== undefined ? Number(param.weight) : 10,
        (param.rule || '').trim(),
        JSON.stringify(param.subparameters || []),
        nextIndex,
        now,
        now
      );

    const insertedId = Number(result.lastInsertRowid);
    const newParam = db.prepare('SELECT * FROM workspace_parameters WHERE id = ?').get(insertedId) as any;

    return {
      ok: true,
      parameter: {
        id: newParam.id,
        param_key: newParam.param_key,
        title: newParam.title,
        category: newParam.category,
        question: newParam.question,
        fatal: Boolean(newParam.fatal),
        weight: Number(newParam.weight),
        rule: newParam.rule,
        subparameters: param.subparameters || [],
        display_order: newParam.display_order,
        created_at: newParam.created_at,
        updated_at: newParam.updated_at,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to create parameter.' };
  }
}

export function updateWorkspaceParameter(
  db: DatabaseSync,
  id: number,
  param: {
    param_key?: string;
    title?: string;
    category?: string;
    question?: string;
    fatal?: boolean;
    weight?: number;
    rule?: string;
    subparameters?: WorkspaceSubparameter[];
    display_order?: number;
  }
): { ok: boolean; parameter?: WorkspaceParameter; error?: string } {
  try {
    const existing = db.prepare('SELECT * FROM workspace_parameters WHERE id = ?').get(id) as any;
    if (!existing) {
      return { ok: false, error: 'Parameter not found.' };
    }

    const now = new Date().toISOString();
    const newKey = param.param_key !== undefined ? param.param_key.trim().toUpperCase() : existing.param_key;
    const newTitle = param.title !== undefined ? param.title.trim() : existing.title;
    const newCategory = param.category !== undefined ? param.category.trim() : existing.category;
    const newQuestion = param.question !== undefined ? param.question.trim() : existing.question;
    const newFatal = param.fatal !== undefined ? (param.fatal ? 1 : 0) : existing.fatal;
    const newWeight = param.weight !== undefined ? Number(param.weight) : existing.weight;
    const newRule = param.rule !== undefined ? param.rule.trim() : existing.rule;
    const newSubparams =
      param.subparameters !== undefined ? JSON.stringify(param.subparameters) : existing.subparameters;
    const newOrder = param.display_order !== undefined ? Number(param.display_order) : existing.display_order;

    db.prepare(`
      UPDATE workspace_parameters
      SET param_key = ?, title = ?, category = ?, question = ?, fatal = ?, weight = ?, rule = ?, subparameters = ?, display_order = ?, updated_at = ?
      WHERE id = ?
    `).run(newKey, newTitle, newCategory, newQuestion, newFatal, newWeight, newRule, newSubparams, newOrder, now, id);

    let parsedSubparams: WorkspaceSubparameter[] = [];
    try {
      parsedSubparams = JSON.parse(newSubparams);
    } catch {}

    return {
      ok: true,
      parameter: {
        id,
        param_key: newKey,
        title: newTitle,
        category: newCategory,
        question: newQuestion,
        fatal: Boolean(newFatal),
        weight: newWeight,
        rule: newRule,
        subparameters: parsedSubparams,
        display_order: newOrder,
        created_at: existing.created_at,
        updated_at: now,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to update parameter.' };
  }
}

export function deleteWorkspaceParameter(db: DatabaseSync, id: number): { ok: boolean; error?: string } {
  try {
    const res = db.prepare('DELETE FROM workspace_parameters WHERE id = ?').run(id);
    if (res.changes === 0) {
      return { ok: false, error: 'Parameter not found.' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to delete parameter.' };
  }
}

export function bulkSaveWorkspaceParameters(
  db: DatabaseSync,
  params: Array<Partial<WorkspaceParameter>>
): { ok: boolean; error?: string; count?: number } {
  try {
    if (!Array.isArray(params)) {
      return { ok: false, error: 'Parameters array expected.' };
    }
    if (params.length > 50) {
      return { ok: false, error: 'Cannot exceed 50 parameters limit per workspace.' };
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec('DELETE FROM workspace_parameters;');
      const now = new Date().toISOString();
      const insertStmt = db.prepare(`
        INSERT INTO workspace_parameters (param_key, title, category, question, fatal, weight, rule, subparameters, display_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      params.forEach((p, index) => {
        const key = p.param_key || `P${String(index + 1).padStart(2, '0')}`;
        const title = p.title || `Parameter ${index + 1}`;
        const cat = p.category || 'General';
        const q = p.question || title;
        const fatal = p.fatal ? 1 : 0;
        const weight = p.weight !== undefined ? Number(p.weight) : 10;
        const rule = p.rule || '';
        const subparams = JSON.stringify(p.subparameters || []);
        insertStmt.run(key, title, cat, q, fatal, weight, rule, subparams, index + 1, now, now);
      });

      db.exec('COMMIT;');
      return { ok: true, count: params.length };
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to bulk save parameters.' };
  }
}

export function resetWorkspaceParameters(
  db: DatabaseSync,
  workspaceId: string
): { ok: boolean; parameters: WorkspaceParameter[]; error?: string } {
  try {
    const wsDef = getWorkspaceById(workspaceId);
    if (!wsDef) {
      return { ok: false, parameters: [], error: 'Workspace not found.' };
    }

    db.exec('DELETE FROM workspace_parameters;');
    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO workspace_parameters (param_key, title, category, question, fatal, weight, rule, subparameters, display_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    wsDef.starterParameters.forEach((p, idx) => {
      insertStmt.run(
        p.param_key,
        p.title,
        p.category,
        p.question,
        p.fatal ? 1 : 0,
        p.weight,
        p.rule,
        JSON.stringify(p.subparameters || []),
        idx + 1,
        now,
        now
      );
    });

    const refreshed = getWorkspaceParameters(db);
    return { ok: true, parameters: refreshed };
  } catch (err: any) {
    return { ok: false, parameters: [], error: err?.message || 'Failed to reset parameters.' };
  }
}
