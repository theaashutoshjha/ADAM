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

export interface WorkspaceDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: 'equity' | 'mutual_fund' | 'support';
  dbFileName: string;
  defaultUser: {
    username: string;
    email: string;
    full_name: string;
    password: string;
    role: string;
  };
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
// The 9 Authoritative Workspaces Definition
// -------------------------------------------------------------
export const WORKSPACES: WorkspaceDefinition[] = [
  {
    id: 'preorder_desk',
    name: 'Pre-order Regulatory Desk',
    tagline: 'SEBI Voice Mandate Compliance',
    description: 'SEBI Regulatory Pre-Order Voice & Quality Audit Engine (Untouched primary system)',
    category: 'equity',
    dbFileName: 'auditeq_production.db', // Points to primary production database
    defaultUser: {
      username: 'preorder',
      email: 'preorder.regulatory@fundsindia.com',
      full_name: 'Pre-Order Compliance Officer',
      password: process.env.ADMIN_PASSWORD || 'Fi*119147',
      role: 'admin',
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
  {
    id: 'customer_support',
    name: 'Customer support',
    tagline: 'Service Excellence & Query Resolution',
    description: 'Customer Support Quality Assurance & Ticket Resolution Audit Desk',
    category: 'support',
    dbFileName: 'customer_support.db',
    defaultUser: {
      username: 'cs_support',
      email: 'support.qa@fundsindia.com',
      full_name: 'Customer Support Lead',
      password: 'Support@Secure#92',
      role: 'support_lead',
    },
    starterParameters: [
      {
        param_key: 'CS01',
        title: 'Professional Greeting & Caller Verification',
        category: 'Greeting & Verification',
        question: 'Did the executive greet the customer warmly and verify caller identity?',
        fatal: false,
        weight: 10,
        rule: 'Greet with branded intro, ask client name & verify registered mobile or client ID.',
        subparameters: [
          { id: 'cs01_1', title: 'Branded Company Greeting', description: 'Stated company name and executive name clearly', mandatory: true },
          { id: 'cs01_2', title: 'Caller Verification', description: 'Verified Client ID or registered telephone number', mandatory: true },
        ],
      },
      {
        param_key: 'CS02',
        title: 'Security & Confidentiality Protocol',
        category: 'Security',
        question: 'Was OTP or sensitive password never solicited or revealed over call?',
        fatal: true,
        weight: 25,
        rule: 'FATAL violation if executive asked customer for trading password, MPIN, or bank OTP.',
        subparameters: [
          { id: 'cs02_1', title: 'Zero Password / OTP Solicitation', description: 'Explicit prohibition of asking for confidential credentials', mandatory: true },
          { id: 'cs02_2', title: 'Secure Identity Protocol Followed', description: 'Followed standard 2-point non-intrusive verification', mandatory: true },
        ],
      },
      {
        param_key: 'CS03',
        title: 'Active Listening & Problem Understanding',
        category: 'Communication',
        question: 'Did the executive listen actively without interrupting and acknowledge query?',
        fatal: false,
        weight: 15,
        rule: 'No cross-talk, polite paraphrasing of the issue, and empathetic acknowledgment.',
        subparameters: [
          { id: 'cs03_1', title: 'No Cross-Talk / Interruption', description: 'Allowed customer to complete explanation without interruption', mandatory: true },
          { id: 'cs03_2', title: 'Query Paraphrasing', description: 'Repeated core issue back to client to confirm alignment', mandatory: false },
        ],
      },
      {
        param_key: 'CS04',
        title: 'Accurate Information & First Call Resolution (FCR)',
        category: 'Resolution',
        question: 'Was correct technical / portal guidance provided to resolve query?',
        fatal: false,
        weight: 20,
        rule: 'Accurate step-by-step guidance on FundsIndia portal or app features provided.',
        subparameters: [
          { id: 'cs04_1', title: 'Factual Accuracy', description: 'Correct navigation paths, fund details, and turnaround times given', mandatory: true },
          { id: 'cs04_2', title: 'FCR Delivery', description: 'Attempted complete resolution without unwarranted re-routing', mandatory: false },
        ],
      },
      {
        param_key: 'CS05',
        title: 'Professional Hold & Mute Etiquette',
        category: 'Call Handling',
        question: 'Were hold permissions sought and updates given every 60 seconds?',
        fatal: false,
        weight: 10,
        rule: 'Request permission before hold, hold duration under 2 minutes with status refresh.',
        subparameters: [
          { id: 'cs05_1', title: 'Permission Before Placing On Hold', description: 'Politely asked for permission with estimated duration', mandatory: true },
          { id: 'cs05_2', title: 'Thanked Caller Upon Returning', description: 'Thanked customer for holding upon unmuting', mandatory: true },
        ],
      },
      {
        param_key: 'CS06',
        title: 'Ticket Logging & Reference Number Sharing',
        category: 'Documentation',
        question: 'Was an official support ticket reference generated and provided?',
        fatal: false,
        weight: 10,
        rule: 'State CRM service request ticket ID or SMS confirmation ETA.',
        subparameters: [
          { id: 'cs06_1', title: 'Ticket Reference Shared', description: 'Provided CRM ticket ID to caller for tracking', mandatory: true },
        ],
      },
      {
        param_key: 'CS07',
        title: 'Polite Call Closing & Further Assistance Offer',
        category: 'Closing',
        question: 'Did executive offer further assistance and thank customer before disconnect?',
        fatal: false,
        weight: 10,
        rule: 'Asked "Is there anything else I can assist you with today?" before formal signoff.',
        subparameters: [
          { id: 'cs07_1', title: 'Offered Further Assistance', description: 'Checked if any other services needed', mandatory: true },
          { id: 'cs07_2', title: 'Warm Closing Signoff', description: 'Used polite brand closing statement', mandatory: true },
        ],
      },
    ],
  },
  {
    id: 'mf_gold',
    name: 'MF Gold',
    tagline: 'High-Value Portfolio Advisory Audit',
    description: 'Mutual Fund Gold Tier Advisory, Asset Allocation & Portfolio Review Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_gold.db',
    defaultUser: {
      username: 'mfgold_desk',
      email: 'gold.wealth@fundsindia.com',
      full_name: 'MF Gold Wealth Lead',
      password: 'GoldAdvisory*83$',
      role: 'mf_gold_lead',
    },
    starterParameters: [
      {
        param_key: 'MFG01',
        title: 'Client Risk Profile & Goal Horizon Alignment',
        category: 'Suitability',
        question: 'Was recommendation strictly aligned with customer documented risk tolerance?',
        fatal: true,
        weight: 25,
        rule: 'FATAL if aggressive equity fund recommended to conservative/low-risk investor.',
        subparameters: [
          { id: 'mfg01_1', title: 'Risk Scorecard Verification', description: 'Reconfirmed client risk profile before recommending schemes', mandatory: true },
          { id: 'mfg01_2', title: 'Investment Horizon Suitability', description: 'Verified investment horizon matches scheme duration (>3-5 yrs for equity)', mandatory: true },
        ],
      },
      {
        param_key: 'MFG02',
        title: 'TER, Exit Load & Expense Disclosure',
        category: 'Regulatory',
        question: 'Were Total Expense Ratio (TER), exit loads, and lock-in terms explained?',
        fatal: false,
        weight: 20,
        rule: 'State scheme exit load tenure, lock-in for ELSS (3 years), and tax implications.',
        subparameters: [
          { id: 'mfg02_1', title: 'Exit Load Structure Disclosed', description: 'Explained percentage deduction if redeemed within cut-off', mandatory: true },
          { id: 'mfg02_2', title: 'Tax Implications Overview', description: 'Explained LTCG / STCG tax rules clearly without giving tax advice', mandatory: false },
        ],
      },
      {
        param_key: 'MFG03',
        title: 'Benchmark & Historical Performance Context',
        category: 'Product Transparency',
        question: 'Was scheme performance presented against benchmark with statutory disclaimer?',
        fatal: false,
        weight: 15,
        rule: 'Include "Past performance does not guarantee future results" disclaimer.',
        subparameters: [
          { id: 'mfg03_1', title: 'TRI Benchmark Comparison', description: 'Compared returns against Nifty 50 TRI or Category Average', mandatory: true },
          { id: 'mfg03_2', title: 'Mandatory Risk Disclaimer', description: 'Delivered standard mutual funds market risk warning', mandatory: true },
        ],
      },
      {
        param_key: 'MFG04',
        title: 'No Guaranteed Returns or Assured Dividend Claims',
        category: 'Compliance Integrity',
        question: 'Did advisor strictly refrain from promising guaranteed yield or dividend rates?',
        fatal: true,
        weight: 25,
        rule: 'FATAL violation if advisor claimed fixed return, zero-risk, or assured payouts.',
        subparameters: [
          { id: 'mfg04_1', title: 'Zero Return Commitment', description: 'Absolute prohibition of guaranteed capital or growth promises', mandatory: true },
        ],
      },
      {
        param_key: 'MFG05',
        title: 'SIP / Lumpsum Transaction Mandate Confirmation',
        category: 'Execution',
        question: 'Were scheme name, folio number, SIP date, and installment amount confirmed?',
        fatal: false,
        weight: 15,
        rule: 'Explicit confirmation of monthly deduction date, amount, and NACH/e-mandate.',
        subparameters: [
          { id: 'mfg05_1', title: 'Installment & Date Confirmation', description: 'Confirmed recurring debit date and monthly sum', mandatory: true },
          { id: 'mfg05_2', title: 'Direct vs Regular Option Disclosed', description: 'Accurate scheme name with growth/dividend option recorded', mandatory: true },
        ],
      },
    ],
  },
  {
    id: 'mf_silver',
    name: 'MF Silver',
    tagline: 'Standard Tier MF Advisory & Review',
    description: 'Mutual Fund Silver Tier Retail Advisory & Systematic Investment Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_silver.db',
    defaultUser: {
      username: 'mfsilver_desk',
      email: 'silver.retail@fundsindia.com',
      full_name: 'MF Silver Retail Lead',
      password: 'SilverWealth#47!',
      role: 'mf_silver_lead',
    },
    starterParameters: [
      {
        param_key: 'MFS01',
        title: 'Identity Verification & Folio Linkage',
        category: 'Verification',
        question: 'Did the advisor confirm customer identity and active folio credentials?',
        fatal: false,
        weight: 15,
        rule: 'Verify caller registered name, registered mobile, and client code.',
        subparameters: [
          { id: 'mfs01_1', title: 'Caller Verification', description: 'Checked client code and registered mobile', mandatory: true },
        ],
      },
      {
        param_key: 'MFS02',
        title: 'Scheme Objective & Category Explanation',
        category: 'Advisory',
        question: 'Was the fund category (Large Cap, Flexi Cap, Debt, Hybrid) explained?',
        fatal: false,
        weight: 20,
        rule: 'Explain asset allocation and risk profile of the recommended category.',
        subparameters: [
          { id: 'mfs02_1', title: 'Category Risk Level Stated', description: 'Explained equity vs debt allocation clearly', mandatory: true },
        ],
      },
      {
        param_key: 'MFS03',
        title: 'Statutory SEBI Riskometer Disclosure',
        category: 'Compliance',
        question: 'Was the SEBI Riskometer level (Moderate, High, Very High) communicated?',
        fatal: true,
        weight: 25,
        rule: 'FATAL if high-risk fund sold without disclosing Very High riskometer rating.',
        subparameters: [
          { id: 'mfs03_1', title: 'Riskometer Disclosure', description: 'Disclosed official SEBI scheme riskometer status', mandatory: true },
        ],
      },
      {
        param_key: 'MFS04',
        title: 'SIP Mandate & Bank Account Confirmation',
        category: 'Transaction',
        question: 'Was linked bank account ending digits and auto-debit process verified?',
        fatal: false,
        weight: 20,
        rule: 'Confirm last 4 digits of registered bank account for SIP mandate authorization.',
        subparameters: [
          { id: 'mfs04_1', title: 'Bank Account Masked Verification', description: 'Confirmed last 4 digits of bank account with customer', mandatory: true },
        ],
      },
      {
        param_key: 'MFS05',
        title: 'Zero Return Commitment & Risk Disclosure',
        category: 'Compliance Integrity',
        question: 'Was zero return guarantee maintained and statutory market risk stated?',
        fatal: true,
        weight: 20,
        rule: 'FATAL if advisor promised assured capital protection or specific CAGR returns.',
        subparameters: [
          { id: 'mfs05_1', title: 'No Return Guarantees', description: 'Zero profit promises or guaranteed returns', mandatory: true },
        ],
      },
    ],
  },
  {
    id: 'mf_digital',
    name: 'MF Digital',
    tagline: 'Digital Platforms & App Experience',
    description: 'Mutual Fund App, Web Portal & Digital Ingestion Workflow Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_digital.db',
    defaultUser: {
      username: 'mfdigital_desk',
      email: 'digital.appqa@fundsindia.com',
      full_name: 'MF Digital Platform Lead',
      password: 'DigitalOps@61&',
      role: 'mf_digital_lead',
    },
    starterParameters: [
      {
        param_key: 'MFD01',
        title: 'Digital Portal Navigation & Self-Service Guidance',
        category: 'Digital Guidance',
        question: 'Did the executive provide clear, step-by-step guidance on app/web UI?',
        fatal: false,
        weight: 20,
        rule: 'Provide intuitive navigation cues for mobile app and web dashboard features.',
        subparameters: [
          { id: 'mfd01_1', title: 'App Screen Walkthrough', description: 'Guided user through mobile app menu items accurately', mandatory: true },
        ],
      },
      {
        param_key: 'MFD02',
        title: 'Zero Remote Screen-Share / Unverified App Download',
        category: 'Cyber Security',
        question: 'Did the executive strictly avoid asking user to install unauthorized remote tools?',
        fatal: true,
        weight: 35,
        rule: 'FATAL violation if executive asked customer to install AnyDesk, TeamViewer, or third-party APKs.',
        subparameters: [
          { id: 'mfd02_1', title: 'No Remote Access Tools', description: 'Never requested installation of third-party remote control tools', mandatory: true },
          { id: 'mfd02_2', title: 'Official App Store Verification', description: 'Directed only to official Google Play or Apple App Store links', mandatory: true },
        ],
      },
      {
        param_key: 'MFD03',
        title: 'Payment Gateway & UPI Flow Explanation',
        category: 'Transactions',
        question: 'Were UPI auto-pay, net banking, and NEFT payment cut-off timings explained?',
        fatal: false,
        weight: 20,
        rule: 'Disclose NAV cut-off times (1:30 PM / 3:00 PM) for same-day realization.',
        subparameters: [
          { id: 'mfd03_1', title: 'NAV Cut-off Time Explained', description: 'Informed client of funds realization cut-off timings', mandatory: true },
        ],
      },
      {
        param_key: 'MFD04',
        title: 'Two-Factor Authentication (2FA) Guidance',
        category: 'Security',
        question: 'Was customer guided to activate biometric/OTP 2FA securely?',
        fatal: false,
        weight: 25,
        rule: 'Reminded customer to keep biometric lock and 2FA credentials confidential.',
        subparameters: [
          { id: 'mfd04_1', title: '2FA Advice', description: 'Encouraged biometric login activation without asking for PIN', mandatory: true },
        ],
      },
    ],
  },
  {
    id: 'mf_onboarding',
    name: 'MF Onboarding',
    tagline: 'KYC & Initial Account Setup Audit',
    description: 'Mutual Fund Client Onboarding, e-KYC Verification & Document Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_onboarding.db',
    defaultUser: {
      username: 'mfonboard_desk',
      email: 'mf.kyc@fundsindia.com',
      full_name: 'MF Onboarding Lead',
      password: 'OnboardKyc*35^',
      role: 'mf_onboarding_lead',
    },
    starterParameters: [
      {
        param_key: 'MFO01',
        title: 'PAN & KRA KYC Status Verification',
        category: 'KYC Compliance',
        question: 'Was PAN validity and CVL/NDML/CAMS KRA status verified accurately?',
        fatal: true,
        weight: 25,
        rule: 'FATAL if account processed without verified KRA registered/validated PAN status.',
        subparameters: [
          { id: 'mfo01_1', title: 'KRA Database Verification', description: 'Cross-checked PAN with CVL/CAMS/NDML KRA registry', mandatory: true },
          { id: 'mfo01_2', title: 'Aadhaar-PAN Linkage Confirmation', description: 'Confirmed PAN is operative and linked with Aadhaar', mandatory: true },
        ],
      },
      {
        param_key: 'MFO02',
        title: 'FATCA & UBO Declaration Verification',
        category: 'Regulatory',
        question: 'Were FATCA tax residency and Ultimate Beneficial Ownership declarations taken?',
        fatal: true,
        weight: 20,
        rule: 'FATAL if NRI or foreign tax resident onboarded without mandatory FATCA declaration.',
        subparameters: [
          { id: 'mfo02_1', title: 'Indian Tax Residency Confirmed', description: 'Confirmed tax residency exclusively in India or recorded foreign tax ID', mandatory: true },
        ],
      },
      {
        param_key: 'MFO03',
        title: 'Bank Account Penny Drop / Cheque Proof Validation',
        category: 'Banking Compliance',
        question: 'Was bank verification completed via automated penny drop or cancelled cheque?',
        fatal: true,
        weight: 25,
        rule: 'FATAL if third-party bank account linked or name mismatch ignored.',
        subparameters: [
          { id: 'mfo03_1', title: 'Penny Drop Name Match', description: 'Beneficiary name matches PAN name precisely (>80% fuzzy match)', mandatory: true },
          { id: 'mfo03_2', title: 'IFSC & Account Type Verified', description: 'Confirmed correct IFSC branch and Savings/NRE account type', mandatory: true },
        ],
      },
      {
        param_key: 'MFO04',
        title: 'Nominee Opt-in / Opt-out Declaration',
        category: 'SEBI Compliance',
        question: 'Was nominee registration or explicit SEBI opt-out declaration executed?',
        fatal: false,
        weight: 15,
        rule: 'Ensure nominee name, relationship, and allocation percentage or signed opt-out.',
        subparameters: [
          { id: 'mfo04_1', title: 'Nominee Details Verified', description: 'Name, relationship, and 100% share allocation recorded', mandatory: true },
        ],
      },
      {
        param_key: 'MFO05',
        title: 'Turnaround Time (TAT) Communication',
        category: 'Customer Experience',
        question: 'Was the client clearly informed of the 24-48 hr verification TAT and next steps?',
        fatal: false,
        weight: 15,
        rule: 'State realistic TAT for account activation and welcome email delivery.',
        subparameters: [
          { id: 'mfo05_1', title: 'Clear Next Steps Communicated', description: 'Informed client of first SIP date and portal credentials delivery', mandatory: true },
        ],
      },
    ],
  },
  {
    id: 'equity_onboarding',
    name: 'Equity Onboarding',
    tagline: 'Trading & Demat Account Onboarding',
    description: 'Equity Brokerage, Demat Account Opening & Exchange Registration Audit Desk',
    category: 'equity',
    dbFileName: 'equity_onboarding.db',
    defaultUser: {
      username: 'eqonboard_desk',
      email: 'equity.demat@fundsindia.com',
      full_name: 'Equity Demat Onboarding Lead',
      password: 'EqDemat#74$',
      role: 'equity_onboarding_lead',
    },
    starterParameters: [
      {
        param_key: 'EQO01',
        title: 'IPV (In-Person Verification) & Geo-Tagging Compliance',
        category: 'SEBI Demat Norms',
        question: 'Was live video IPV conducted with geo-tagging, timestamp & OTP confirmation?',
        fatal: true,
        weight: 30,
        rule: 'FATAL violation if IPV video is missing, pre-recorded, or unreadable ID shown.',
        subparameters: [
          { id: 'eqo01_1', title: 'Live Video Feed Verified', description: 'Customer face clearly visible alongside original PAN card', mandatory: true },
          { id: 'eqo01_2', title: 'Geo-Coordinates & Real-Time OTP Recorded', description: 'GPS coordinates within Indian territory and random verification code spoken', mandatory: true },
        ],
      },
      {
        param_key: 'EQO02',
        title: 'Segment Selection & Derivative Income Proof Verification',
        category: 'Exchange Regulations',
        question: 'Was valid income proof (6-mo bank statement / ITR) verified for F&O/Currency?',
        fatal: true,
        weight: 25,
        rule: 'FATAL if F&O/Derivatives activated without verified financial income proof.',
        subparameters: [
          { id: 'eqo02_1', title: 'Income Document Authenticity', description: 'Verified salary slip, ITR-V, Form 16, or 6-month bank statement', mandatory: true },
          { id: 'eqo02_2', title: 'Segment Consent Recorded', description: 'Explicit opt-in recorded for NSE/BSE Cash and F&O segments', mandatory: true },
        ],
      },
      {
        param_key: 'EQO03',
        title: 'Tariff & Brokerage Schedule Disclosure',
        category: 'Transparency',
        question: 'Were brokerage charges, STT, exchange turnover fees, and AMC disclosed?',
        fatal: false,
        weight: 20,
        rule: 'Disclose delivery brokerage, intraday charges, and demat annual maintenance fee.',
        subparameters: [
          { id: 'eqo03_1', title: 'Clear Brokerage Rate Stated', description: 'Explained flat fee or percentage per executed trade', mandatory: true },
          { id: 'eqo03_2', title: 'Statutory Taxes Disclosed', description: 'Mentioned STT, GST, Stamp Duty, and SEBI turnover charges', mandatory: false },
        ],
      },
      {
        param_key: 'EQO04',
        title: 'POA / DDPI (Demat Debit and Pledge Instruction) Explanation',
        category: 'Compliance',
        question: 'Were DDPI limits and electronic delivery authentication (EDIS) explained?',
        fatal: false,
        weight: 15,
        rule: 'Explain why DDPI is used exclusively for settlement of sell trades.',
        subparameters: [
          { id: 'eqo04_1', title: 'Scope of DDPI Restricted to Sell Obligations', description: 'Clarified DDPI cannot be used for unauthorized transfers', mandatory: true },
        ],
      },
      {
        param_key: 'EQO05',
        title: 'Aadhaar e-Sign Verification',
        category: 'Digital Verification',
        question: 'Was NSDL/CDSL e-sign executed via customer registered Aadhaar OTP?',
        fatal: true,
        weight: 10,
        rule: 'FATAL if signature uploaded without UIDAI Aadhaar OTP verification.',
        subparameters: [
          { id: 'eqo05_1', title: 'NSDL Electronic Signature Verified', description: 'Tamper-proof digital signature verified on final KYC PDF', mandatory: true },
        ],
      },
    ],
  },
  {
    id: 'equity_regular',
    name: 'Equity Regular',
    tagline: 'Standard Equity Trading & Dealer Support',
    description: 'Equity Dealing Desk Regular Operations, Order Routing & Advisory Quality Audit Desk',
    category: 'equity',
    dbFileName: 'equity_regular.db',
    defaultUser: {
      username: 'eqregular_desk',
      email: 'equity.regular@fundsindia.com',
      full_name: 'Equity Regular Dealing Lead',
      password: 'EqTrader@58!',
      role: 'equity_regular_lead',
    },
    starterParameters: [
      {
        param_key: 'EQR01',
        title: 'Registered Contact Authorization',
        category: 'Authentication',
        question: 'Was order instructed strictly from client registered/authorized contact number?',
        fatal: true,
        weight: 20,
        rule: 'FATAL if order accepted from unregistered third-party phone number without mandate.',
        subparameters: [
          { id: 'eqr01_1', title: 'Caller CLI Match', description: 'Caller ID verified against CRM registered contact', mandatory: true },
        ],
      },
      {
        param_key: 'EQR02',
        title: 'Accurate Scrip, Exchange & Order Type Specification',
        category: 'Trade Precision',
        question: 'Were scrip name, exchange (NSE/BSE), order type (Limit/Market/SL), and side confirmed?',
        fatal: false,
        weight: 25,
        rule: 'Executive confirmed BUY/SELL, exact quantity, price, and validity (Day/IOC).',
        subparameters: [
          { id: 'eqr02_1', title: 'Buy / Sell Direction Confirmed', description: 'Explicit verification of trade direction', mandatory: true },
          { id: 'eqr02_2', title: 'Exchange & Product Type (CNC / MIS)', description: 'Confirmed whether delivery (CNC) or intraday (MIS/Margin)', mandatory: true },
        ],
      },
      {
        param_key: 'EQR03',
        title: 'Available Margin & Funds Check',
        category: 'Risk Management',
        question: 'Did executive verify available ledger balance / margin before order placement?',
        fatal: false,
        weight: 20,
        rule: 'Disclose required upfront margin and peak margin compliance.',
        subparameters: [
          { id: 'eqr03_1', title: 'Margin Verification', description: 'Checked client trade limit and upfront margin adequacy', mandatory: true },
        ],
      },
      {
        param_key: 'EQR04',
        title: 'Customer Explicit Verbal Confirmation',
        category: 'Consent',
        question: 'Did customer explicitly authorize trade execution in unequivocal words?',
        fatal: true,
        weight: 20,
        rule: 'FATAL if trade placed on assumption without verbal customer authorization.',
        subparameters: [
          { id: 'eqr04_1', title: 'Explicit Verbal Authorization', description: 'Customer gave clear verbal order command before execution', mandatory: true },
        ],
      },
      {
        param_key: 'EQR05',
        title: 'Zero Return Commitment & Risk Disclosure',
        category: 'Compliance Integrity',
        question: 'Did dealer refrain from offering profit guarantees or speculative tips?',
        fatal: true,
        weight: 15,
        rule: 'FATAL if dealer promised target returns, tips, or assured price appreciation.',
        subparameters: [
          { id: 'eqr05_1', title: 'Zero Profit Assurances', description: 'No guaranteed returns or unauthorized personal tips given', mandatory: true },
        ],
      },
    ],
  },
  {
    id: 'mf_platinum',
    name: 'MF platinum',
    tagline: 'HNW & Ultra-HNW Wealth Desk',
    description: 'Mutual Fund Platinum Tier Wealth Advisory, PMS / AIF Consultation & Bespoke Audit Desk',
    category: 'mutual_fund',
    dbFileName: 'mf_platinum.db',
    defaultUser: {
      username: 'mfplatinum_desk',
      email: 'platinum.hni@fundsindia.com',
      full_name: 'MF Platinum HNW Desk Lead',
      password: 'PlatinumHni*19#',
      role: 'mf_platinum_lead',
    },
    starterParameters: [
      {
        param_key: 'MFP01',
        title: 'Dedicated RM Greeting & HNW Etiquette',
        category: 'Executive Service',
        question: 'Did dedicated Relationship Manager greet client with executive warmth & verify portfolio?',
        fatal: false,
        weight: 15,
        rule: 'Address client respectfully by title/name, reference family office / folio context.',
        subparameters: [
          { id: 'mfp01_1', title: 'Executive Relationship Greeting', description: 'Greeted client with high-touch personalized professionalism', mandatory: true },
          { id: 'mfp01_2', title: 'Portfolio Context Acknowledged', description: 'Referenced existing asset allocation and mandate history', mandatory: false },
        ],
      },
      {
        param_key: 'MFP02',
        title: 'Accredited Investor / Risk Profiling Verification',
        category: 'Suitability',
        question: 'Was comprehensive risk appetite and net-worth suitability evaluated?',
        fatal: true,
        weight: 25,
        rule: 'FATAL if high-risk structured products recommended without HNW risk profiling.',
        subparameters: [
          { id: 'mfp02_1', title: 'Net-worth Suitability Verification', description: 'Confirmed client qualifies under SEBI HNW/Accredited guidelines', mandatory: true },
          { id: 'mfp02_2', title: 'Liquidity & Drawdown Tolerance Evaluated', description: 'Discussed portfolio drawdown limits and liquidity horizon', mandatory: true },
        ],
      },
      {
        param_key: 'MFP03',
        title: 'Detailed Portfolio Attribution & Asset Allocation Rationale',
        category: 'Advisory Quality',
        question: 'Was comprehensive investment thesis, Sharpe ratio, and alpha attribution articulated?',
        fatal: false,
        weight: 20,
        rule: 'Discuss manager track record, downside protection, portfolio concentration, and debt duration.',
        subparameters: [
          { id: 'mfp03_1', title: 'Investment Thesis Articulated', description: 'Explained fundamental and macro reasoning for asset allocation', mandatory: true },
          { id: 'mfp03_2', title: 'Comparative Analysis Given', description: 'Compared against peer funds and benchmark over 5-10 year market cycles', mandatory: false },
        ],
      },
      {
        param_key: 'MFP04',
        title: 'Statutory Fee, Hurdle Rate & High-Water Mark Transparency',
        category: 'Fee Transparency',
        question: 'Were management fees, hurdle rates, performance fees, and GST clearly specified?',
        fatal: false,
        weight: 15,
        rule: 'Full disclosure of all direct/regular expense ratios and advisory fees in writing and verbally.',
        subparameters: [
          { id: 'mfp04_1', title: 'Transparent Fee Breakdown', description: 'Disclosed exact percentage fee and performance fee thresholds', mandatory: true },
        ],
      },
      {
        param_key: 'MFP05',
        title: 'Zero Return Commitment Guarantee',
        category: 'Compliance Integrity',
        question: 'Did Wealth Manager strictly refrain from assuring capital protection or target yields?',
        fatal: true,
        weight: 25,
        rule: 'FATAL violation if Wealth Manager guaranteed principal protection or promised specific CAGR returns.',
        subparameters: [
          { id: 'mfp05_1', title: 'Zero Capital or Return Guarantee', description: 'Absolute compliance with SEBI prohibition of assured returns', mandatory: true },
          { id: 'mfp05_2', title: 'Market Volatility Risk Addressed', description: 'Explicitly highlighted potential equity volatility and credit risks', mandatory: true },
        ],
      },
    ],
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

  // Initialize starter parameters if empty
  const countRow = db.prepare('SELECT count(*) as c FROM workspace_parameters').get() as { c: number };
  if ((countRow?.c || 0) === 0) {
    const wsDef = getWorkspaceById(workspaceId);
    if (wsDef && wsDef.starterParameters.length > 0) {
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

  // Ensure workspace_parameters table exists in primary database too for consistency
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

  // Initialize the remaining 8 workspace databases
  for (const ws of WORKSPACES) {
    if (ws.id === 'preorder_desk') continue;

    const dbPath = path.join(dir, ws.dbFileName);
    const wsDb = new DatabaseSync(dbPath);
    ensureWorkspaceSchema(wsDb, ws.id);
    workspaceConnections.set(ws.id, wsDb);
  }

  // Provision user accounts for all 9 workspaces in primary users table
  provisionWorkspaceUsers(primarySqlite);
}

function hashUserPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function provisionWorkspaceUsers(primarySqlite: DatabaseSync): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  for (const ws of WORKSPACES) {
    const u = ws.defaultUser;
    const cleanEmail = u.email.trim().toLowerCase();
    const cleanUsername = u.username.trim().toLowerCase();

    let existing: { id: number; workspace_id?: string } | undefined;
    if (ws.id === 'preorder_desk') {
      existing = primarySqlite
        .prepare('SELECT id, workspace_id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?')
        .get(cleanUsername, cleanEmail) as { id: number; workspace_id?: string } | undefined;
    } else {
      existing = primarySqlite
        .prepare('SELECT id, workspace_id FROM users WHERE workspace_id = ?')
        .get(ws.id) as { id: number; workspace_id?: string } | undefined;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashUserPassword(u.password, salt);

    if (existing) {
      primarySqlite
        .prepare('UPDATE users SET username = ?, email = ?, full_name = ?, role = ?, workspace_id = ?, password_hash = ?, salt = ? WHERE id = ?')
        .run(cleanUsername, cleanEmail, u.full_name, u.role, ws.id, hash, salt, existing.id);
    } else {
      primarySqlite
        .prepare(`
          INSERT INTO users (username, email, full_name, password_hash, salt, role, workspace_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(cleanUsername, cleanEmail, u.full_name, hash, salt, u.role, ws.id, now);
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
