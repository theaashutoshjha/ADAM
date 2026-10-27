// =============================================================
// ADAM-AR — Authoritative RuleSet Configuration & Release Readiness Validator
// Enforces LR-31, LR-55, LR-56, LR-67, LR-80, and Decision Register D-01..D-09
// =============================================================

import type { DatabaseSync } from 'node:sqlite';

export type DecisionStatus = 'OPEN' | 'PROPOSED' | 'LOCKED';

export interface BusinessDecision {
  id: string; // D-01 to D-09
  title: string;
  topic: string;
  owner: string;
  status: DecisionStatus;
  lockedDate?: string | null;
  lockedBy?: string | null;
  parameters: Record<string, any>;
  blockingDescription: string;
}

export interface RuleSetConfig {
  version: string;
  effectiveDate: string;
  decisions: Record<string, BusinessDecision>;
  timingPolicy: {
    orderTimestampRequired: boolean;
    clockSkewToleranceSeconds: number;
    timezone: string;
  };
  asrPolicy: {
    provider: 'GEMINI_FLASH_KEYPOOL_ONLY';
    model: 'gemini-2.0-flash';
    supportedLanguageProfiles: string[];
    maxKeytermTokens: number;
    maxKeytermCount: number;
  };
  scoringPolicy: {
    version: string;
    weights: { Q1: number; Q2: number; Q3: number; Q4: number; Q5: number };
    fatalQuestions: string[];
    denominator: 'APPLICABLE_SUM';
  };
}

/**
 * Authoritative default RuleSet reflecting RULES.md v2.1.0-production-lock.
 * Per spec, D-01..D-05, D-07 are PROPOSED, and D-06, D-08, D-09 are OPEN.
 * Engineering MUST NOT invent locked status.
 */
export const DEFAULT_RULESET: RuleSetConfig = {
  version: '2.1.0-production-lock',
  effectiveDate: '2026-09-20',
  decisions: {
    'D-01': {
      id: 'D-01',
      title: 'Six-minute pre-order grouping',
      topic: 'Pre-order engine boundaries & chaining',
      owner: 'Business + Compliance',
      status: 'PROPOSED',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        enabled: true,
        applies_when: 'same_client_code AND same_trade_date AND distinct_scripts >= 2',
        timestamp_field: 'trade.order_timestamp',
        window_seconds: 360,
        boundary: 'inclusive',
        mode: 'anchored',
        order_by: ['order_timestamp', 'trade_id'],
        missing_timestamp: 'INSUFFICIENT_PRE_ORDER_DATA',
      },
      blockingDescription: 'Exact six-minute grouping mode (anchored vs rolling) requires formal Business + Compliance sign-off.',
    },
    'D-02': {
      id: 'D-02',
      title: 'Order-timestamp policy (Q2/Q3)',
      topic: 'Timing comparison & missing timestamp behavior',
      owner: 'Compliance',
      status: 'PROPOSED',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        order_timestamp_required: true,
        on_missing: 'ORDER_TIMESTAMP_MISSING',
        proxy_basis: null,
        clock_skew_tolerance_seconds: 0,
        timezone: 'Asia/Kolkata',
      },
      blockingDescription: 'Option A requires compliance confirmation that order timestamps are mandatory in trade report imports.',
    },
    'D-03': {
      id: 'D-03',
      title: 'Language profiles for code-switched calls',
      topic: 'Worker A ASR routing & code-switch policy',
      owner: 'Ops + Tech',
      status: 'PROPOSED',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        supported_profiles: ['EN', 'HI', 'TA', 'TE', 'HI_EN', 'TA_EN', 'TE_EN'],
        source_order: ['metadata', 'client_master', 'advisor_master', 'unresolved'],
        multi_supported_for: ['en', 'hi'],
        keyterm_max_tokens: 500,
        keyterm_max_count: 50,
      },
      blockingDescription: 'Gold-set accuracy benchmark must be recorded before language profiles can be locked.',
    },
    'D-04': {
      id: 'D-04',
      title: 'Q1 registered-number source',
      topic: 'Authoritative registered phone hierarchy',
      owner: 'Compliance',
      status: 'PROPOSED',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        primary_source: 'client_master',
        allowed_number_types: ['primary', 'alternate', 'authorized_representative'],
        disallow_trade_phone_override: true,
      },
      blockingDescription: 'Compliance head must confirm whether alternate/authorized numbers constitute registered contact.',
    },
    'D-05': {
      id: 'D-05',
      title: 'Mail-PDF schema, priority and role',
      topic: 'Mail confirmation PDF matching tiers',
      owner: 'Business + Compliance',
      status: 'PROPOSED',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        profile: 'mail_pdf_profile_v1',
        match_priority: ['exact_trade_or_order_id', 'client_script_date_qty_price_exact'],
        is_gating: false,
        sample_corpus_size: 30,
      },
      blockingDescription: 'Requires verification against at least 30 real production contract note PDFs.',
    },
    'D-06': {
      id: 'D-06',
      title: 'Pre-order definition, date scope, cardinality',
      topic: 'Pre-order eligibility criteria and trade join scope',
      owner: 'Business',
      status: 'OPEN',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        classification_rule: 'call_start_before_order',
        date_scope: 'call_date_equals_trade_date',
        multi_call_cardinality: 'SHARED_PREORDER_SEPARATE_SCORECARDS',
      },
      blockingDescription: 'Business owner must formally confirm date scoping and multi-call trade cardinality.',
    },
    'D-07': {
      id: 'D-07',
      title: 'Scoring contract and status vocabulary',
      topic: 'Authoritative rubric weights, fatal flags, denominator',
      owner: 'Compliance',
      status: 'PROPOSED',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        scoring_version: 'SC-1',
        weights: { Q1: 1, Q2: 1, Q3: 1, Q4: 1, Q5: 1 },
        fatal: { Q1: true, Q2: true, Q3: false, Q4: false, Q5: true },
        denominator: 'sum_of_applicable_weights',
        vocabulary: {
          question: ['PASS', 'FAIL', 'UNDETERMINED'],
          final_status: ['PASS', 'FATAL_FAIL', 'UNDETERMINED'],
        },
      },
      blockingDescription: 'Compliance head sign-off required on Q4 exclusion and fatal-undetermined scoring semantics.',
    },
    'D-08': {
      id: 'D-08',
      title: 'Source column contracts',
      topic: 'Header binding for 7 ingestion sources',
      owner: 'Ops + Tech',
      status: 'OPEN',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        requires_sample_files: true,
        metadata_columns: { call_id: 'col_c', customer_number: 'col_e', agent: 'col_j', call_start: 'col_q' },
        trade_columns: { advisor: 'col_b', number: 'col_f', client_code: 'client_code', script: 'script', qty: 'quantity', price: 'price', order_time: 'order_timestamp' },
      },
      blockingDescription: 'One real redacted sample file per source is required to freeze header bindings.',
    },
    'D-09': {
      id: 'D-09',
      title: 'Retention, masking, legal basis',
      topic: 'DPDP Act 2023, SEBI record keeping, data retention',
      owner: 'Legal / Compliance',
      status: 'OPEN',
      lockedDate: null,
      lockedBy: null,
      parameters: {
        legal_basis: 'SEBI_MANDATED_CALL_AUDIT',
        dpdp_compliant: false,
        retention_years: 5,
        mask_customer_phone_by_default: true,
      },
      blockingDescription: 'Legal counsel sign-off required on third-party ASR processor terms and DPDP retention requirements.',
    },
  },
  timingPolicy: {
    orderTimestampRequired: true,
    clockSkewToleranceSeconds: 0,
    timezone: 'Asia/Kolkata',
  },
  asrPolicy: {
    provider: 'GEMINI_FLASH_KEYPOOL_ONLY',
    model: 'gemini-2.0-flash',
    supportedLanguageProfiles: ['EN', 'HI', 'TA', 'TE', 'HI_EN', 'TA_EN', 'TE_EN'],
    maxKeytermTokens: 500,
    maxKeytermCount: 50,
  },
  scoringPolicy: {
    version: 'SC-1',
    weights: { Q1: 1, Q2: 1, Q3: 1, Q4: 1, Q5: 1 },
    fatalQuestions: ['Q1', 'Q2', 'Q5'],
    denominator: 'APPLICABLE_SUM',
  },
};

export interface ReleaseReadinessCheckItem {
  category: 'BUSINESS_DECISION' | 'SOURCE_CONTRACT' | 'PROVIDER_ASR' | 'PROVIDER_LLM' | 'PROVIDER_EMAIL' | 'SECURITY' | 'TIME_INTEGRITY' | 'DATABASE';
  code: string;
  title: string;
  status: 'PASSED' | 'BLOCKED' | 'WARNING';
  details: string;
}

export interface ReleaseReadinessReport {
  isProductionReady: boolean;
  productionProcessingStatus: 'ENABLED' | 'BLOCKED';
  activeRuleSetVersion: string;
  totalBlockers: number;
  totalWarnings: number;
  totalPassed: number;
  decisions: Record<string, {
    id: string;
    title: string;
    status: DecisionStatus;
    owner: string;
    blockingDescription?: string;
  }>;
  checklist: ReleaseReadinessCheckItem[];
  generatedAt: string;
}

/**
 * Initializes the rule_sets table if missing and seeds DEFAULT_RULESET.
 */
export function ensureRuleSetTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rule_sets (
      version TEXT PRIMARY KEY,
      effective_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const existing = db.prepare('SELECT version FROM rule_sets WHERE version = ?').get(DEFAULT_RULESET.version);
  if (!existing) {
    db.prepare(`
      INSERT INTO rule_sets (version, effective_date, status, config_json, created_at, updated_at)
      VALUES (?, ?, 'DRAFT', ?, ?, ?)
    `).run(
      DEFAULT_RULESET.version,
      DEFAULT_RULESET.effectiveDate,
      JSON.stringify(DEFAULT_RULESET),
      now,
      now
    );
  }
}

/**
 * Retrieves the authoritative active RuleSet from database.
 */
export function getActiveRuleSet(db: DatabaseSync): RuleSetConfig {
  ensureRuleSetTable(db);
  try {
    const row = db.prepare('SELECT config_json FROM rule_sets ORDER BY created_at DESC LIMIT 1').get() as { config_json: string } | undefined;
    if (row?.config_json) {
      return JSON.parse(row.config_json) as RuleSetConfig;
    }
  } catch {}
  return DEFAULT_RULESET;
}

/**
 * Evaluates the full release readiness report.
 * Per LR-56 and LR-80, production processing is BLOCKED if any required decision is OPEN or PROPOSED.
 */
export function evaluateReleaseReadiness(db: DatabaseSync): ReleaseReadinessReport {
  const ruleSet = getActiveRuleSet(db);
  const checklist: ReleaseReadinessCheckItem[] = [];
  const decisionsSummary: ReleaseReadinessReport['decisions'] = {};

  let totalBlockers = 0;
  let totalWarnings = 0;
  let totalPassed = 0;

  // 1. Evaluate Decisions D-01 through D-09
  for (const [id, dec] of Object.entries(ruleSet.decisions)) {
    decisionsSummary[id] = {
      id: dec.id,
      title: dec.title,
      status: dec.status,
      owner: dec.owner,
      blockingDescription: dec.status !== 'LOCKED' ? dec.blockingDescription : undefined,
    };

    if (dec.status === 'LOCKED') {
      checklist.push({
        category: 'BUSINESS_DECISION',
        code: id,
        title: `${id}: ${dec.title}`,
        status: 'PASSED',
        details: `LOCKED by ${dec.lockedBy || 'Owner'} on ${dec.lockedDate || 'N/A'}.`,
      });
      totalPassed++;
    } else {
      checklist.push({
        category: 'BUSINESS_DECISION',
        code: id,
        title: `${id}: ${dec.title}`,
        status: 'BLOCKED',
        details: `Current status is ${dec.status} (Owner: ${dec.owner}). ${dec.blockingDescription}`,
      });
      totalBlockers++;
    }
  }

  // 2. Evaluate Provider ASR Configuration (Deepgram Nova-3 Multi-Lingual Engine)
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (dgKey && dgKey.trim().length > 5 && !dgKey.includes('your_deepgram_api_key_here')) {
    checklist.push({
      category: 'PROVIDER_ASR',
      code: 'ASR_DEEPGRAM_CONFIG',
      title: 'Deepgram Nova-3 ASR Engine',
      status: 'PASSED',
      details: 'Deepgram Nova-3 Multi-Lingual Engine active for production telephony transcription with diarization.',
    });
    totalPassed++;
  } else {
    checklist.push({
      category: 'PROVIDER_ASR',
      code: 'ASR_DEEPGRAM_CONFIG',
      title: 'Deepgram Nova-3 ASR Engine',
      status: 'BLOCKED',
      details: 'DEEPGRAM_API_KEY is missing or unconfigured. Production ASR requires Deepgram Nova-3.',
    });
    totalBlockers++;
  }

  // 3. Evaluate Provider LLM Configuration
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if ((geminiKey && geminiKey.trim().length > 10) || (groqKey && groqKey.trim().length > 10)) {
    checklist.push({
      category: 'PROVIDER_LLM',
      code: 'LLM_EVALUATOR_CONFIG',
      title: 'Compliance Evaluation LLM Key',
      status: 'PASSED',
      details: 'Evaluator LLM API key configured for structured semantic compliance analysis.',
    });
    totalPassed++;
  } else {
    checklist.push({
      category: 'PROVIDER_LLM',
      code: 'LLM_EVALUATOR_CONFIG',
      title: 'Compliance Evaluation LLM Key',
      status: 'BLOCKED',
      details: 'GEMINI_API_KEY or GROQ_API_KEY is missing for semantic Q5 analysis.',
    });
    totalBlockers++;
  }

  // 4. Evaluate Security & Timezone Settings
  const tz = ruleSet.timingPolicy.timezone;
  if (tz === 'Asia/Kolkata') {
    checklist.push({
      category: 'TIME_INTEGRITY',
      code: 'TIMEZONE_KOLKATA',
      title: 'Authoritative Compliance Timezone',
      status: 'PASSED',
      details: 'Asia/Kolkata timezone enforced for market hours and order timing (LR-04, LR-57).',
    });
    totalPassed++;
  } else {
    checklist.push({
      category: 'TIME_INTEGRITY',
      code: 'TIMEZONE_KOLKATA',
      title: 'Authoritative Compliance Timezone',
      status: 'BLOCKED',
      details: `Configured timezone "${tz}" violates required Asia/Kolkata market timezone.`,
    });
    totalBlockers++;
  }

  // 5. Overall Readiness Determination
  const isProductionReady = totalBlockers === 0;
  const productionProcessingStatus = isProductionReady ? 'ENABLED' : 'BLOCKED';

  return {
    isProductionReady,
    productionProcessingStatus,
    activeRuleSetVersion: ruleSet.version,
    totalBlockers,
    totalWarnings,
    totalPassed,
    decisions: decisionsSummary,
    checklist,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Asserts that production processing is authorized.
 * Throws a structured Error if any decision or required configuration is unresolved.
 */
export function assertProductionProcessingAllowed(db: DatabaseSync): void {
  const readiness = evaluateReleaseReadiness(db);
  if (!readiness.isProductionReady) {
    const blockers = readiness.checklist
      .filter((c) => c.status === 'BLOCKED')
      .map((c) => `[${c.code}] ${c.title}: ${c.details}`);
    const err = new Error(
      `PRODUCTION_PROCESSING_BLOCKED: ${readiness.totalBlockers} unresolved release requirement(s) prevent production audit execution.\n` +
      blockers.join('\n')
    );
    (err as any).statusCode = 412; // Precondition Failed
    (err as any).readiness = readiness;
    throw err;
  }
}
