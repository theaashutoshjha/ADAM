import React from 'react';
import {
  ShieldCheck,
  Lock,
  Database,
  Layers,
  Cpu,
  ArrowRight,
  Headphones,
  Coins,
  Gem,
  Smartphone,
  UserCheck,
  TrendingUp,
  Crown,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Server,
  Zap,
  Globe,
  Award,
} from 'lucide-react';
import { AdamLogo } from './AdamLogo';

interface AdamLandingPageProps {
  onGetStarted: () => void;
}

export const AdamLandingPage: React.FC<AdamLandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-[#040814] text-slate-200 font-sans selection:bg-cyan-500 selection:text-black">
      {/* ============================================================ */}
      {/* 1. TOP INSTITUTIONAL NAVIGATION BAR                         */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-50 border-b border-[#111e3b] bg-[#050b1d]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AdamLogo size={34} showText={false} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white font-sans">
                  ADAM-AR
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                  PRO v17.2
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono tracking-tight leading-none">
                Autonomous Compliance Quality Intelligence
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <a href="#overview" className="hover:text-cyan-300 transition-colors">
              Platform Overview
            </a>
            <a href="#desks" className="hover:text-cyan-300 transition-colors">
              9 Isolated Desks
            </a>
            <a href="#rubric" className="hover:text-cyan-300 transition-colors">
              Regulatory Rubric
            </a>
            <a href="#architecture" className="hover:text-cyan-300 transition-colors">
              Architecture & Security
            </a>
          </nav>

          <button
            type="button"
            onClick={onGetStarted}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs tracking-wide flex items-center gap-2 border border-cyan-400/40 cursor-pointer shadow-lg shadow-cyan-950/50"
          >
            <span>Get Started / Sign In</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. HERO SECTION                                              */}
      {/* ============================================================ */}
      <section id="overview" className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0a1738] border border-cyan-500/30 text-cyan-300 text-xs font-mono">
            <ShieldCheck size={14} className="text-cyan-400 shrink-0" />
            <span>INSTITUTIONAL SEBI VOICE MANDATE AUDITING ENGINE</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight font-sans">
            Autonomous Speech & Compliance Intelligence for Financial Desks
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl mx-auto">
            ADAM (<span className="text-cyan-300 font-semibold">Autonomous Dealer Audit & Mandate</span>) is an enterprise-grade
            regulatory intelligence engine built to enforce strict SEBI pre-order trade compliance, mutual fund advisory suitability,
            and customer service governance with 100% deterministic precision and zero cross-workspace data bleed.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={onGetStarted}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 border border-cyan-400/50 shadow-xl shadow-cyan-950/60 cursor-pointer"
            >
              <span>Get Started • Access Workplace</span>
              <ArrowRight size={16} />
            </button>
            <a
              href="#desks"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#09132a] hover:bg-[#0e1d40] text-slate-200 font-semibold text-sm border border-[#1a2d59] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Explore 9 Desks</span>
            </a>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-8 text-left max-w-4xl mx-auto">
            <div className="p-3.5 rounded-2xl bg-[#081126] border border-[#142347]">
              <div className="text-xl font-bold font-mono text-cyan-300">4,096+</div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">Production Calls Audited</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#081126] border border-[#142347]">
              <div className="text-xl font-bold font-mono text-emerald-400">100%</div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">Deterministic Q1–Q5 Precision</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#081126] border border-[#142347]">
              <div className="text-xl font-bold font-mono text-indigo-300">9 Desks</div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">Isolated SQLite Databases</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#081126] border border-[#142347]">
              <div className="text-xl font-bold font-mono text-amber-300">Zero Bleed</div>
              <div className="text-[11px] text-slate-400 font-sans mt-0.5">Cryptographic Isolation</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. DEEP DIVE: WHAT ADAM DOES                                 */}
      {/* ============================================================ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#111e3b]">
        <div className="max-w-3xl mb-12">
          <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest mb-1.5">
            Core Architecture & Capabilities
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            How ADAM Solves Institutional Compliance
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Stock brokers and wealth managers in India are mandated by SEBI circulars to preserve an unalterable audio record of client trade authorizations. ADAM automates the entire ingestion, speech recognition, correlation, and scoring lifecycle.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#070f24] border border-[#17274f] space-y-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 w-fit">
              <Cpu size={22} />
            </div>
            <h3 className="text-base font-bold text-white">Multi-Lingual Nova-3 Telephony ASR</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Processes dual-channel telephonic recordings across English, Hindi, Tamil, Telugu, Gujarati, and Hinglish. Automatically attributes speakers (Dealer vs Client) with high-speed millisecond timestamps.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#070f24] border border-[#17274f] space-y-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-300 border border-blue-500/20 w-fit">
              <Layers size={22} />
            </div>
            <h3 className="text-base font-bold text-white">4-Anchor Trade Reconciliation</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Correlates speech recordings with executed trade files via 4 independent anchors: Unique Client Code (UCC), Scrip / Symbol (phonetic matching), Quantity, and Price / CMP window matching.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#070f24] border border-[#17274f] space-y-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-300 border border-purple-500/20 w-fit">
              <Database size={22} />
            </div>
            <h3 className="text-base font-bold text-white">Isolated Multi-Tenant Databases</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every workspace desk operates on its own dedicated SQLite WAL database file and unique cryptographic credentials. No data crosses workspace boundaries, and backups remain strictly segregated.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. THE 9 AUTHORITATIVE WORKSPACE DESKS                      */}
      {/* ============================================================ */}
      <section id="desks" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#111e3b]">
        <div className="max-w-3xl mb-10">
          <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest mb-1.5">
            Strict Multi-Tenancy Architecture
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            The 9 Specialized Compliance Workspaces
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Each workspace represents a distinct operational desk with its own personal database storage, custom parameters (up to 50 parameters), and secure personal credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Pre-order Regulatory Desk */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-cyan-500/40 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Building2 size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                Primary System
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">Pre-order Regulatory Desk</h3>
            <p className="text-xs text-slate-400 mt-1">
              Full SEBI voice mandate compliance, Q1–Q5 deterministic rubric, and 4,096+ production trade audit records.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: auditeq_production.db</span>
              <span className="text-cyan-300 font-bold">Personal ID: preorder</span>
            </div>
          </div>

          {/* 2. Customer support */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Headphones size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                Support Desk
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">Customer support</h3>
            <p className="text-xs text-slate-400 mt-1">
              Customer support ticket QA, zero OTP/password solicitation enforcement, hold etiquette & FCR tracking.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: customer_support.db</span>
              <span className="text-indigo-300 font-bold">Personal ID: cs_support</span>
            </div>
          </div>

          {/* 3. MF Gold */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Coins size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                Wealth Desk
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">MF Gold</h3>
            <p className="text-xs text-slate-400 mt-1">
              High-value mutual fund advisory, asset allocation, TER/exit load disclosure & zero guaranteed return auditing.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: mf_gold.db</span>
              <span className="text-amber-300 font-bold">Personal ID: mfgold_desk</span>
            </div>
          </div>

          {/* 4. MF Silver */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-slate-400/20 text-slate-200 border border-slate-400/30">
                <Gem size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-700">
                Retail Wealth
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">MF Silver</h3>
            <p className="text-xs text-slate-400 mt-1">
              Retail Systematic Investment Plan (SIP) advisory, SEBI Riskometer disclosure & bank auto-debit checks.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: mf_silver.db</span>
              <span className="text-slate-300 font-bold">Personal ID: mfsilver_desk</span>
            </div>
          </div>

          {/* 5. MF Digital */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
                <Smartphone size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                Digital App Desk
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">MF Digital</h3>
            <p className="text-xs text-slate-400 mt-1">
              Mobile app and web portal telephony QA, zero remote tool installation (AnyDesk/TeamViewer) and 2FA compliance.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: mf_digital.db</span>
              <span className="text-teal-300 font-bold">Personal ID: mfdigital_desk</span>
            </div>
          </div>

          {/* 6. MF Onboarding */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                <UserCheck size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                KYC Desk
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">MF Onboarding</h3>
            <p className="text-xs text-slate-400 mt-1">
              PAN/KRA registry validation, FATCA tax residency declarations, penny-drop bank verification & nominee opt-out.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: mf_onboarding.db</span>
              <span className="text-blue-300 font-bold">Personal ID: mfonboard_desk</span>
            </div>
          </div>

          {/* 7. Equity Onboarding */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <UserCheck size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                Demat Desk
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">Equity Onboarding</h3>
            <p className="text-xs text-slate-400 mt-1">
              Live video IPV with geo-tagging, F&O income proof verification, tariff disclosure & Aadhaar e-Sign audit.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: equity_onboarding.db</span>
              <span className="text-emerald-300 font-bold">Personal ID: eqonboard_desk</span>
            </div>
          </div>

          {/* 8. Equity Regular */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30">
                <TrendingUp size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                Dealing Desk
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">Equity Regular</h3>
            <p className="text-xs text-slate-400 mt-1">
              Secondary market dealing desk order routing, upfront margin check, verbal order confirmation & zero tip audit.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: equity_regular.db</span>
              <span className="text-sky-300 font-bold">Personal ID: eqregular_desk</span>
            </div>
          </div>

          {/* 9. MF platinum */}
          <div className="p-5 rounded-2xl bg-[#08122a] border border-[#182852]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Crown size={18} />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                Ultra HNI Desk
              </span>
            </div>
            <h3 className="text-sm font-bold text-white">MF platinum</h3>
            <p className="text-xs text-slate-400 mt-1">
              High-net-worth portfolio management, family office consultation, PMS/AIF suitability & bespoke governance.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>DB: mf_platinum.db</span>
              <span className="text-purple-300 font-bold">Personal ID: mfplatinum_desk</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. THE DETERMINISTIC SEBI REGULATORY RUBRIC (Q1–Q5)          */}
      {/* ============================================================ */}
      <section id="rubric" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#111e3b]">
        <div className="max-w-3xl mb-10">
          <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest mb-1.5">
            SEBI Regulatory Mandate
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            The Authoritative 5-Point Audit Standard
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Every audio interaction is deterministically evaluated against statutory SEBI order placement rules. Any breach on fatal parameters results in immediate audit failure and regulatory escalation.
          </p>
        </div>

        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-[#081126] border border-[#192b56] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="px-2.5 py-1 rounded-xl bg-red-950/80 text-red-300 border border-red-500/40 text-xs font-mono font-bold shrink-0">
                Q1 • FATAL
              </span>
              <div>
                <h4 className="text-sm font-bold text-white">Registered Mobile Number Verification</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Caller CLI and phone number must strictly match the authorized registered contact in trade records. Mismatched callers fail immediately.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-red-400 font-bold shrink-0">Weight: 20 pts (Fatal)</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#081126] border border-[#192b56] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="px-2.5 py-1 rounded-xl bg-red-950/80 text-red-300 border border-red-500/40 text-xs font-mono font-bold shrink-0">
                Q2 • FATAL
              </span>
              <div>
                <h4 className="text-sm font-bold text-white">Pre-Order Timestamp Chronology</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verbal consent must precede the official exchange order dispatch timestamp. Post-order confirmation calls are an illegal breach.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-red-400 font-bold shrink-0">Weight: 20 pts (Fatal)</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#081126] border border-[#192b56] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="px-2.5 py-1 rounded-xl bg-blue-950/80 text-blue-300 border border-blue-500/40 text-xs font-mono font-bold shrink-0">
                Q3 • QUALITY
              </span>
              <div>
                <h4 className="text-sm font-bold text-white">Scrip, Price & Quantity Disclosure</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dealer must articulate the exact stock name, order price (or CMP/market order acknowledgment), and total share volume.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-cyan-300 font-bold shrink-0">Weight: 20 pts</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#081126] border border-[#192b56] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="px-2.5 py-1 rounded-xl bg-blue-950/80 text-blue-300 border border-blue-500/40 text-xs font-mono font-bold shrink-0">
                Q4 • CONSENT
              </span>
              <div>
                <h4 className="text-sm font-bold text-white">Customer Affirmative Verbal Consent</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customer must provide unequivocal, unambiguous verbal affirmation (e.g., &quot;yes, proceed with the order&quot;) before submission.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-cyan-300 font-bold shrink-0">Weight: 20 pts</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#081126] border border-[#192b56] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="px-2.5 py-1 rounded-xl bg-red-950/80 text-red-300 border border-red-500/40 text-xs font-mono font-bold shrink-0">
                Q5 • FATAL
              </span>
              <div>
                <h4 className="text-sm font-bold text-white">Zero Return Commitment Guarantee</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Absolute prohibition against offering profit assurances, target yields, or guaranteed return promises during advisory dialogue.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-red-400 font-bold shrink-0">Weight: 20 pts (Fatal)</span>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. SECURITY, BACKUP & ENTERPRISE ISOLATION                   */}
      {/* ============================================================ */}
      <section id="architecture" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#111e3b]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">
              Zero Data Bleed • Security by Design
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Enterprise Storage & Cryptographic Isolation
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Every compliance team operates in complete isolation. Physical databases, file storage directories, and backup snapshot routines are strictly partitioned per workspace ID.
            </p>

            <ul className="space-y-2.5 text-xs text-slate-300 font-sans">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span><b>Independent Database Engine:</b> Each workspace connects to its own SQLite WAL file.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span><b>Automated Segregated Backups:</b> Backups route to `.data/backups/&#123;workspace_id&#125;_backup.db`.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span><b>Personal Cryptographic Credentials:</b> Passwords hashed via scrypt with unique salts.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span><b>Strict Token Binding:</b> Session tokens are bound to the tenant workspace database.</span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-3xl bg-[#070e24] border border-[#1b2d5a] space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
                <Server size={14} />
                <span>Active Multi-Tenant Engine</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                ONLINE
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-[#050b1d] border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Pre-Order Regulatory:</span>
                <span className="text-emerald-400 font-bold">auditeq_production.db</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#050b1d] border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Customer Support:</span>
                <span className="text-cyan-300 font-bold">customer_support.db</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#050b1d] border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Mutual Fund Desks (5):</span>
                <span className="text-indigo-300 font-bold">mf_*.db (Personal)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#050b1d] border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Equity Desks (2):</span>
                <span className="text-amber-300 font-bold">equity_*.db (Personal)</span>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-500 font-mono text-center">
              Multi-Tenant Architecture Active • Zero Cross-Workspace Data Leakage
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 7. GET STARTED CTA SECTION                                   */}
      {/* ============================================================ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#111e3b]">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-[#0a1533] to-[#060c20] border border-cyan-500/30 text-center max-w-3xl mx-auto space-y-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-xs font-mono">
            <Lock size={13} />
            <span>AUTHENTICATED ACCESS ONLY</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Ready to Enter the Compliance Platform?
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            Click below to open the secure login portal. Enter your designated workspace credentials to access your isolated workspace.
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={onGetStarted}
              className="px-8 py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 border border-cyan-400/50 shadow-xl shadow-cyan-950/70 mx-auto cursor-pointer"
            >
              <span>Get Started • Open Login Portal</span>
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 8. FOOTER                                                    */}
      {/* ============================================================ */}
      <footer className="border-t border-[#101b36] py-8 px-4 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <AdamLogo size={20} showText={false} />
            <span>ADAM-AR PRO • FundsIndia Institutional Compliance</span>
          </div>
          <div>
            SEBI Regulatory Mandate Compliance Engine • Version 17.2 • All Rights Reserved
          </div>
        </div>
      </footer>
    </div>
  );
};
